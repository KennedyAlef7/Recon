import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { norm } from "./lib/extratoParser.js";
import { carregarCaixa, carregarClientes, salvarClientes } from "./lib/caixaStore.js";

const C = {
  bg: "#F4F6F5",
  card: "#FFFFFF",
  ink: "#1A2421",
  inkSoft: "#5C6B66",
  line: "#DDE4E1",
  green: "#0E6B4F",
  greenSoft: "#E3F0EB",
  amber: "#9A6A12",
  amberSoft: "#F7EDDA",
  red: "#A93226",
  redSoft: "#F8E5E2",
  blue: "#1F4E79",
  blueSoft: "#E4ECF4",
};

const PALETA_CLIENTES = ["#0E6B4F", "#1F4E79", "#9A6A12", "#5B2D8E", "#A93226", "#0E7C86", "#8E44AD", "#B7590C", "#2E7D32", "#C2185B"];
const COR_CAIXINHA = "#94A3B8";
const COR_NAO_CLASSIFICADO = "#B0B8B5";

const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmtMes = (ym) => {
  if (!ym || ym === "total") return "Total do período";
  const [y, m] = ym.split("-");
  return `${MESES_LABEL[parseInt(m, 10) - 1]}/${y}`;
};

function corDoCliente(cliente, idx) {
  return cliente.cor || PALETA_CLIENTES[idx % PALETA_CLIENTES.length];
}

// ---------- Aprendizado de apelido a partir da descrição do extrato ----------
const STOPWORDS_EXTRATO = new Set([
  "PIX", "RECEBIDO", "RECEBIDA", "TED", "DOC", "TRANSFERENCIA", "CREDITO",
  "DEPOSITO", "ENVIADO", "ENVIADA", "DE", "DA", "DO", "PAGAMENTO", "COBRANCA", "REF",
]);
function extrairNucleo(descricao) {
  const tokens = norm(descricao).split(" ").filter((t) => t && !STOPWORDS_EXTRATO.has(t) && !/^\d+$/.test(t));
  const nucleo = tokens.join(" ").trim();
  return nucleo || descricao.trim();
}

// ---------- Classificação automática ----------
function tentarClassificarAutomatico(transacao, clientes) {
  const descN = norm(transacao.descricao);
  const descDigits = transacao.descricao.replace(/\D/g, "");
  const matches = clientes.filter((c) => {
    const cnpjDigits = (c.cnpj || "").replace(/\D/g, "");
    if (cnpjDigits.length >= 8 && descDigits.includes(cnpjDigits.slice(0, 8))) return true;
    return (c.apelidos || []).some((ap) => {
      const apN = norm(ap);
      return apN.length > 2 && descN.includes(apN);
    });
  });
  return matches.length === 1 ? matches[0].id : null;
}

// ---------- Evolução mensal do saldo da caixinha (reaproveita mesma lógica de Caixa.jsx) ----------
function evoluirConta(transacoesConta, saldosConta) {
  const porData = {};
  transacoesConta.forEach((t) => {
    const delta = t.tipo === "credito" ? t.valor : -t.valor;
    porData[t.data] = (porData[t.data] || 0) + delta;
  });
  const datas = Object.keys(porData).sort();
  let acc = 0;
  const cumulativoPorData = {};
  for (const d of datas) { acc += porData[d]; cumulativoPorData[d] = acc; }
  let offset = 0;
  if (saldosConta.length) {
    const ultimo = [...saldosConta].sort((a, b) => a.data.localeCompare(b.data)).pop();
    const datasAteCheckpoint = datas.filter((d) => d <= ultimo.data);
    const cumNaData = datasAteCheckpoint.length ? cumulativoPorData[datasAteCheckpoint[datasAteCheckpoint.length - 1]] : 0;
    offset = ultimo.saldo - cumNaData;
  }
  return { datas, cumulativoPorData, offset };
}
function saldoCaixinhaPorMes(transacoes, saldosConhecidos, meses) {
  const tCaixinha = transacoes.filter((t) => t.conta === "nubank_caixinha");
  const sCaixinha = saldosConhecidos.filter((s) => s.conta === "nubank_caixinha");
  const { datas, cumulativoPorData, offset } = evoluirConta(tCaixinha, sCaixinha);
  const mapa = {};
  meses.forEach((mes) => {
    const fimDoMes = `${mes}-31`;
    const datasAte = datas.filter((d) => d <= fimDoMes);
    mapa[mes] = datasAte.length ? offset + cumulativoPorData[datasAte[datasAte.length - 1]] : offset;
  });
  return { mapa, ultimo: datas.length ? offset + cumulativoPorData[datas[datas.length - 1]] : offset };
}

// Rendimento mensal da caixinha (fluxo, não o saldo acumulado) — usado na distribuição por cliente
function rendimentoCaixinhaPorMes(rendimentosCaixinha, meses) {
  const mapa = {};
  rendimentosCaixinha.forEach((r) => { mapa[r.mes] = r.valor; });
  const total = meses.reduce((s, mes) => s + (mapa[mes] || 0), 0);
  return { mapa, total };
}

// ---------- Cadastro ----------
function FormCliente({ inicial, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(inicial?.nome || "");
  const [cnpj, setCnpj] = useState(inicial?.cnpj || "");
  const [apelidos, setApelidos] = useState(inicial?.apelidos || []);
  const [novoApelido, setNovoApelido] = useState("");
  const [cor, setCor] = useState(inicial?.cor || "");

  function addApelido() {
    const v = novoApelido.trim();
    if (!v || apelidos.some((a) => norm(a) === norm(v))) return;
    setApelidos((prev) => [...prev, v]);
    setNovoApelido("");
  }

  function salvar() {
    if (!nome.trim()) return;
    onSalvar({ id: inicial?.id || uid(), nome: nome.trim(), cnpj: cnpj.trim(), apelidos, cor: cor || undefined });
  }

  return (
    <div className="space-y-3 p-4 rounded-xl" style={{ border: `1px solid ${C.line}`, background: C.card }}>
      <h3 className="font-bold text-sm">{inicial ? "Editar cliente" : "Novo cliente"}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Nome *</label>
          <input className="w-full text-sm rounded-lg px-3 py-2" style={{ border: `1px solid ${C.line}` }} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>CNPJ / CPF (opcional)</label>
          <input className="w-full text-sm rounded-lg px-3 py-2 font-mono" style={{ border: `1px solid ${C.line}` }} value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
          Apelidos / variações como aparece no extrato
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {apelidos.map((a) => (
            <span key={a} className="text-xs px-2 py-1 rounded-full flex items-center gap-1.5" style={{ background: C.blueSoft, color: C.blue }}>
              {a}
              <button onClick={() => setApelidos((prev) => prev.filter((x) => x !== a))} style={{ color: C.blue }}>✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 text-sm rounded-lg px-3 py-1.5" style={{ border: `1px solid ${C.line}` }}
            placeholder="Ex: JOAO SILVA, PIX JOAO..."
            value={novoApelido}
            onChange={(e) => setNovoApelido(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addApelido(); }}
          />
          <button onClick={addApelido} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: C.greenSoft, color: C.green }}>+ Apelido</button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Cor no gráfico</label>
        <div className="flex gap-1.5">
          {PALETA_CLIENTES.map((c) => (
            <button key={c} onClick={() => setCor(c)} className="w-6 h-6 rounded-full" style={{ background: c, outline: cor === c ? `2px solid ${C.ink}` : "none", outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={salvar} disabled={!nome.trim()} className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40" style={{ background: C.green }}>
          {inicial ? "Salvar" : "Cadastrar"}
        </button>
        <button onClick={onCancelar} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "#EEF1F0", color: C.inkSoft }}>Cancelar</button>
      </div>
    </div>
  );
}

function CadastroTab({ clientesData, setClientesData }) {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);

  function salvarCliente(c) {
    setClientesData((prev) => {
      const idx = prev.clientes.findIndex((x) => x.id === c.id);
      const clientes = idx >= 0 ? prev.clientes.map((x) => x.id === c.id ? c : x) : [...prev.clientes, c];
      const novo = { ...prev, clientes };
      salvarClientes(novo);
      return novo;
    });
    setCriando(false); setEditando(null);
  }

  function excluirCliente(id) {
    setClientesData((prev) => {
      const classificacoes = Object.fromEntries(Object.entries(prev.classificacoes).filter(([, cid]) => cid !== id));
      const novo = { ...prev, clientes: prev.clientes.filter((c) => c.id !== id), classificacoes };
      salvarClientes(novo);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      {!criando && !editando && (
        <button onClick={() => setCriando(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: C.blue }}>+ Novo cliente</button>
      )}
      {criando && <FormCliente onSalvar={salvarCliente} onCancelar={() => setCriando(false)} />}
      {editando && <FormCliente inicial={editando} onSalvar={salvarCliente} onCancelar={() => setEditando(null)} />}

      {clientesData.clientes.length === 0 ? (
        <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Nenhum cliente cadastrado ainda.</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {clientesData.clientes.map((c, idx) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: idx ? `1px solid ${C.line}` : "none" }}>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: corDoCliente(c, idx) }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{c.nome}</div>
                <div className="text-xs" style={{ color: C.inkSoft }}>{(c.apelidos || []).join(", ") || "sem apelidos"}</div>
              </div>
              <button onClick={() => { setEditando(c); setCriando(false); }} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ color: C.blue, background: C.blueSoft }}>Editar</button>
              <button onClick={() => { if (confirm(`Excluir "${c.nome}"?`)) excluirCliente(c.id); }} className="text-xs" style={{ color: C.red }}>excluir</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Classificação ----------
function ClassificarTab({ transacoesElegiveis, clientesData, setClientesData }) {
  const { clientes, classificacoes, ignoradas } = clientesData;

  const naoClassificadas = useMemo(
    () => transacoesElegiveis.filter((t) => !classificacoes[t.id] && !ignoradas.includes(t.id)),
    [transacoesElegiveis, classificacoes, ignoradas]
  );
  const classificadas = useMemo(
    () => transacoesElegiveis.filter((t) => classificacoes[t.id]).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30),
    [transacoesElegiveis, classificacoes]
  );

  function classificar(transacao, clienteId) {
    setClientesData((prev) => {
      const cliente = prev.clientes.find((c) => c.id === clienteId);
      const nucleo = extrairNucleo(transacao.descricao);
      const jaTemApelido = (cliente.apelidos || []).some((a) => norm(a) === norm(nucleo));
      const clientes = prev.clientes.map((c) => c.id === clienteId && !jaTemApelido
        ? { ...c, apelidos: [...(c.apelidos || []), nucleo] }
        : c);
      const novo = { ...prev, clientes, classificacoes: { ...prev.classificacoes, [transacao.id]: clienteId } };
      salvarClientes(novo);
      return novo;
    });
  }

  function ignorar(transacao) {
    setClientesData((prev) => {
      const novo = { ...prev, ignoradas: [...prev.ignoradas, transacao.id] };
      salvarClientes(novo);
      return novo;
    });
  }

  function desfazer(transacaoId, tipo) {
    setClientesData((prev) => {
      let novo;
      if (tipo === "classificacao") {
        const classificacoes = { ...prev.classificacoes };
        delete classificacoes[transacaoId];
        novo = { ...prev, classificacoes };
      } else {
        novo = { ...prev, ignoradas: prev.ignoradas.filter((id) => id !== transacaoId) };
      }
      salvarClientes(novo);
      return novo;
    });
  }

  if (!clientes.length) {
    return <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Cadastre clientes na aba "Cadastro" antes de classificar as transações.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>
          Fila de classificação manual ({naoClassificadas.length})
        </div>
        {naoClassificadas.length === 0 ? (
          <div className="text-sm py-6 text-center rounded-lg" style={{ color: C.inkSoft, background: C.bg }}>
            Nenhuma transação pendente — tudo classificado ou ignorado.
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            {naoClassificadas.map((t, idx) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ borderTop: idx ? `1px solid ${C.line}` : "none" }}>
                <span className="font-mono text-xs" style={{ color: C.inkSoft, width: 70 }}>{t.data?.split("-").reverse().join("/")}</span>
                <span className="flex-1 truncate">{t.descricao}</span>
                <span className="font-mono font-bold" style={{ color: C.green }}>{fmtBRL(t.valor)}</span>
                <select
                  className="text-xs rounded-lg px-2 py-1.5" style={{ border: `1px solid ${C.line}` }}
                  onChange={(e) => { if (e.target.value) classificar(t, e.target.value); }}
                  defaultValue=""
                >
                  <option value="" disabled>Atribuir cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <button onClick={() => ignorar(t)} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: C.inkSoft, background: "#EEF1F0" }}>Ignorar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {classificadas.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>Classificadas recentemente</div>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            {classificadas.map((t, idx) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm" style={{ borderTop: idx ? `1px solid ${C.line}` : "none" }}>
                <span className="font-mono text-xs" style={{ color: C.inkSoft, width: 70 }}>{t.data?.split("-").reverse().join("/")}</span>
                <span className="flex-1 truncate">{t.descricao}</span>
                <span className="font-mono" style={{ color: C.inkSoft }}>{fmtBRL(t.valor)}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.greenSoft, color: C.green }}>
                  {clientes.find((c) => c.id === classificacoes[t.id])?.nome || "—"}
                </span>
                <button onClick={() => desfazer(t.id, "classificacao")} className="text-xs" style={{ color: C.red }}>desfazer</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Análise ----------
const NOME_CAIXINHA_POOL = "Caixinha (rendimento do mês)";

function calcularPool(mes, transacoesElegiveis, classificacoes, ignoradas, clientes, rendimentoCaixinha) {
  const doMes = mes === "total" ? transacoesElegiveis : transacoesElegiveis.filter((t) => t.mes === mes);
  const porCliente = {};
  let naoClassificado = 0;
  doMes.forEach((t) => {
    const cid = classificacoes[t.id];
    if (cid) porCliente[cid] = (porCliente[cid] || 0) + t.valor;
    else if (!ignoradas.includes(t.id)) naoClassificado += t.valor;
  });
  const fatias = clientes
    .map((c, idx) => ({ nome: c.nome, valor: porCliente[c.id] || 0, cor: corDoCliente(c, idx) }))
    .filter((f) => f.valor > 0);
  if (naoClassificado > 0.005) fatias.push({ nome: "Não classificado", valor: naoClassificado, cor: COR_NAO_CLASSIFICADO });
  if (rendimentoCaixinha > 0.005) fatias.push({ nome: NOME_CAIXINHA_POOL, valor: rendimentoCaixinha, cor: COR_CAIXINHA });
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return fatias.map((f) => ({ ...f, pct: total > 0 ? (f.valor / total) * 100 : 0 }));
}

function AnaliseTab({ transacoesElegiveis, clientesData, caixaData }) {
  const { clientes, classificacoes, ignoradas } = clientesData;
  const meses = useMemo(() => [...new Set(transacoesElegiveis.map((t) => t.mes))].sort(), [transacoesElegiveis]);
  const [mesSel, setMesSel] = useState("total");

  // Saldo (estoque) da caixinha — usado só como linha de referência de liquidez na linha do tempo
  const { mapa: caixinhaSaldoPorMes } = useMemo(
    () => saldoCaixinhaPorMes(caixaData.transacoes, caixaData.saldosConhecidos, meses),
    [caixaData, meses]
  );
  // Rendimento (fluxo) da caixinha no mês — usado na distribuição por cliente, comparável com o faturamento
  const { mapa: rendimentoPorMes, total: rendimentoTotal } = useMemo(
    () => rendimentoCaixinhaPorMes(caixaData.rendimentosCaixinha, meses),
    [caixaData, meses]
  );

  const faturamentoMensal = useMemo(() => meses.map((mes) => ({
    mes,
    total: transacoesElegiveis.filter((t) => t.mes === mes).reduce((s, t) => s + t.valor, 0),
  })), [meses, transacoesElegiveis]);

  const distribuicao = useMemo(() => {
    const rendimentoCaixinha = mesSel === "total" ? rendimentoTotal : (rendimentoPorMes[mesSel] || 0);
    return calcularPool(mesSel, transacoesElegiveis, classificacoes, ignoradas, clientes, Math.max(0, rendimentoCaixinha));
  }, [mesSel, transacoesElegiveis, classificacoes, ignoradas, clientes, rendimentoPorMes, rendimentoTotal]);

  const linhaDoTempo = useMemo(() => meses.map((mes) => {
    const pool = calcularPool(mes, transacoesElegiveis, classificacoes, ignoradas, clientes, Math.max(0, rendimentoPorMes[mes] || 0));
    const linha = { mes, caixinhaSaldo: caixinhaSaldoPorMes[mes] || 0 };
    pool.forEach((f) => { linha[f.nome] = f.pct; });
    return linha;
  }), [meses, transacoesElegiveis, classificacoes, ignoradas, clientes, rendimentoPorMes, caixinhaSaldoPorMes]);

  const seriesLinhaDoTempo = useMemo(() => {
    const nomes = new Set();
    linhaDoTempo.forEach((l) => Object.keys(l).forEach((k) => { if (k !== "mes" && k !== "caixinhaSaldo") nomes.add(k); }));
    return [...nomes];
  }, [linhaDoTempo]);

  if (!meses.length) {
    return <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Nenhuma receita de cliente importada ainda — importe extratos no módulo "Caixa" primeiro.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>Faturamento mensal bruto</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={faturamentoMensal}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={12} />
            <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
            <Tooltip formatter={(v) => fmtBRL(v)} labelFormatter={fmtMes} />
            <Bar dataKey="total" name="Faturamento" fill={C.green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: C.ink }}>Distribuição percentual por cliente</div>
          <select className="text-xs rounded-lg px-2 py-1.5" style={{ border: `1px solid ${C.line}` }} value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
            <option value="total">Total do período</option>
            {meses.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
          </select>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <ResponsiveContainer width="100%" height={280} style={{ maxWidth: 340 }}>
            <PieChart>
              <Pie data={distribuicao} dataKey="valor" nameKey="nome" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {distribuicao.map((f, i) => <Cell key={i} fill={f.cor} />)}
              </Pie>
              <Tooltip formatter={(v, n, p) => [`${fmtBRL(v)} (${fmtPct(p.payload.pct)})`, p.payload.nome]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 w-full space-y-1.5">
            {distribuicao.map((f) => (
              <div key={f.nome} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                <span className="flex-1">{f.nome}</span>
                <span className="font-mono" style={{ color: C.inkSoft }}>{fmtBRL(f.valor)}</span>
                <span className="font-mono font-bold w-14 text-right">{fmtPct(f.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>Linha do tempo — distribuição por cliente e liquidez da caixinha</div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={linhaDoTempo}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={12} />
            <YAxis yAxisId="pct" tickFormatter={(v) => `${v}%`} fontSize={11} width={45} />
            <YAxis yAxisId="valor" orientation="right" tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
            <Tooltip formatter={(v, name) => name === "Caixinha (saldo)" ? fmtBRL(v) : fmtPct(v)} labelFormatter={fmtMes} />
            <Legend />
            {seriesLinhaDoTempo.map((nome, i) => (
              <Area key={nome} yAxisId="pct" type="monotone" dataKey={nome} name={nome} stackId="1"
                fill={clientes.find((c) => c.nome === nome) ? corDoCliente(clientes.find((c) => c.nome === nome), clientes.findIndex((c) => c.nome === nome)) : (nome === NOME_CAIXINHA_POOL ? COR_CAIXINHA : COR_NAO_CLASSIFICADO)}
                stroke="none" fillOpacity={0.85} />
            ))}
            <Line yAxisId="valor" type="monotone" dataKey="caixinhaSaldo" name="Caixinha (saldo)" stroke={C.ink} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function exportarExcel(transacoesElegiveis, clientesData, caixaData) {
  const { clientes, classificacoes, ignoradas } = clientesData;
  const meses = [...new Set(transacoesElegiveis.map((t) => t.mes))].sort();
  const { mapa: caixinhaSaldoPorMes } = saldoCaixinhaPorMes(caixaData.transacoes, caixaData.saldosConhecidos, meses);
  const { mapa: rendimentoPorMes } = rendimentoCaixinhaPorMes(caixaData.rendimentosCaixinha, meses);

  const faturamento = meses.map((mes) => ({
    Mês: fmtMes(mes),
    Faturamento: transacoesElegiveis.filter((t) => t.mes === mes).reduce((s, t) => s + t.valor, 0),
  }));

  const distribuicaoLinhas = [];
  meses.forEach((mes) => {
    const pool = calcularPool(mes, transacoesElegiveis, classificacoes, ignoradas, clientes, Math.max(0, rendimentoPorMes[mes] || 0));
    pool.forEach((f) => distribuicaoLinhas.push({ Mês: fmtMes(mes), Cliente: f.nome, Valor: f.valor, "Percentual (%)": f.pct.toFixed(1) }));
  });

  const linhaDoTempo = meses.map((mes) => {
    const pool = calcularPool(mes, transacoesElegiveis, classificacoes, ignoradas, clientes, Math.max(0, rendimentoPorMes[mes] || 0));
    const linha = { Mês: fmtMes(mes) };
    pool.forEach((f) => { linha[f.nome] = f.pct.toFixed(1); });
    linha["Caixinha (saldo R$)"] = caixinhaSaldoPorMes[mes] || 0;
    return linha;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(faturamento), "Faturamento Mensal");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(distribuicaoLinhas), "Distribuição por Cliente");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhaDoTempo), "Linha do Tempo");
  XLSX.writeFile(wb, `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Clientes() {
  const [tab, setTab] = useState("cadastro");
  const [clientesData, setClientesData] = useState({ clientes: [], classificacoes: {}, ignoradas: [] });
  const [caixaData, setCaixaData] = useState({ transacoes: [], saldosConhecidos: [], rendimentosCaixinha: [], arquivosImportados: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [cl, cx] = await Promise.all([carregarClientes(), carregarCaixa()]);
      setClientesData(cl);
      setCaixaData(cx);
      setLoaded(true);
    })();
  }, []);

  const transacoesElegiveis = useMemo(
    () => caixaData.transacoes.filter((t) => t.tipo === "credito" && (t.conta === "itau" || t.conta === "nubank")),
    [caixaData]
  );

  // Classificação automática por apelido/CNPJ — roda quando novas transações ou clientes aparecem
  useEffect(() => {
    if (!loaded || !clientesData.clientes.length || !transacoesElegiveis.length) return;
    const pendentes = transacoesElegiveis.filter((t) => !clientesData.classificacoes[t.id] && !clientesData.ignoradas.includes(t.id));
    if (!pendentes.length) return;
    const novasClassificacoes = {};
    pendentes.forEach((t) => {
      const cid = tentarClassificarAutomatico(t, clientesData.clientes);
      if (cid) novasClassificacoes[t.id] = cid;
    });
    if (Object.keys(novasClassificacoes).length) {
      setClientesData((prev) => {
        const novo = { ...prev, classificacoes: { ...prev.classificacoes, ...novasClassificacoes } };
        salvarClientes(novo);
        return novo;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, transacoesElegiveis, clientesData.clientes]);

  const naoClassificadasCount = transacoesElegiveis.filter((t) => !clientesData.classificacoes[t.id] && !clientesData.ignoradas.includes(t.id)).length;

  const tabs = [
    ["cadastro", `Cadastro (${clientesData.clientes.length})`],
    ["classificar", `Classificar${naoClassificadasCount ? ` (${naoClassificadasCount})` : ""}`],
    ["analise", "Análise"],
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4" style={{ borderBottom: `3px solid ${C.green}` }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.green }}>Módulo Clientes</div>
            <h1 className="text-2xl font-bold mt-0.5">Faturamento e distribuição de receita por cliente</h1>
          </div>
          <button
            onClick={() => exportarExcel(transacoesElegiveis, clientesData, caixaData)}
            disabled={!transacoesElegiveis.length}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ color: C.green, background: C.greenSoft }}
          >
            Exportar Excel
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          {[
            ["Clientes cadastrados", String(clientesData.clientes.length), C.ink],
            ["Créditos importados", String(transacoesElegiveis.length), C.blue],
            ["Pendentes de classificação", String(naoClassificadasCount), naoClassificadasCount ? C.amber : C.green],
          ].map(([label, v, color]) => (
            <div key={label} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color }}>{v}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mt-5 flex-wrap">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="px-4 py-2 rounded-t-lg text-sm font-semibold"
              style={tab === k ? { background: C.card, color: C.green, borderBottom: `2px solid ${C.green}` } : { color: C.inkSoft }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-b-xl rounded-tr-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          {!loaded ? (
            <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Carregando…</div>
          ) : (
            <>
              {tab === "cadastro" && <CadastroTab clientesData={clientesData} setClientesData={setClientesData} />}
              {tab === "classificar" && <ClassificarTab transacoesElegiveis={transacoesElegiveis} clientesData={clientesData} setClientesData={setClientesData} />}
              {tab === "analise" && <AnaliseTab transacoesElegiveis={transacoesElegiveis} clientesData={clientesData} caixaData={caixaData} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
