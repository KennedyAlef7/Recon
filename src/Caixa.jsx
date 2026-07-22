import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { parseExtrato, CONTAS } from "./lib/extratoParser.js";
import { carregarCaixa, salvarCaixa, carregarClientes, carregarFinanceiro } from "./lib/caixaStore.js";
import { calcularResultadoMensal } from "./lib/resultado.js";

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
  purple: "#5B2D8E",
};

const CONTA_COR = { itau: C.blue, nubank: C.purple, nubank_caixinha: "#C2185B", c6_ka2: "#0E7C86" };
const CONTA_LABEL = Object.fromEntries(CONTAS.map((c) => [c.key, c.label]));

const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmtMes = (ym) => {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return `${MESES_LABEL[parseInt(m, 10) - 1]}/${y}`;
};

// ---------- Cálculo de evolução de saldo por conta ----------
function evoluirConta(transacoesConta, saldosConta) {
  const porData = {};
  transacoesConta.forEach((t) => {
    const delta = t.tipo === "credito" ? t.valor : -t.valor;
    porData[t.data] = (porData[t.data] || 0) + delta;
  });
  const datas = Object.keys(porData).sort();
  let acc = 0;
  const cumulativoPorData = {};
  for (const d of datas) {
    acc += porData[d];
    cumulativoPorData[d] = acc;
  }
  let offset = 0;
  if (saldosConta.length) {
    const ultimo = [...saldosConta].sort((a, b) => a.data.localeCompare(b.data)).pop();
    const datasAteCheckpoint = datas.filter((d) => d <= ultimo.data);
    const cumNaData = datasAteCheckpoint.length ? cumulativoPorData[datasAteCheckpoint[datasAteCheckpoint.length - 1]] : 0;
    offset = ultimo.saldo - cumNaData;
  }
  return { datas, cumulativoPorData, offset };
}

// Retorna [{mes, [contaKey]: saldoFinalDoMes, total}] ordenado por mês, para as contas pedidas
function evolucaoMensal(transacoes, saldosConhecidos, contas) {
  const evolPorConta = {};
  const mesesSet = new Set();
  contas.forEach((conta) => {
    const tConta = transacoes.filter((t) => t.conta === conta);
    const sConta = saldosConhecidos.filter((s) => s.conta === conta);
    evolPorConta[conta] = evoluirConta(tConta, sConta);
    tConta.forEach((t) => mesesSet.add(t.mes));
    sConta.forEach((s) => mesesSet.add(s.data.slice(0, 7)));
  });
  const meses = [...mesesSet].sort();
  return meses.map((mes) => {
    const linha = { mes };
    let total = 0;
    contas.forEach((conta) => {
      const { datas, cumulativoPorData, offset } = evolPorConta[conta];
      const fimDoMes = `${mes}-31`;
      const datasAte = datas.filter((d) => d <= fimDoMes);
      const saldo = datasAte.length ? offset + cumulativoPorData[datasAte[datasAte.length - 1]] : offset;
      linha[conta] = saldo;
      total += saldo;
    });
    linha.total = total;
    return linha;
  });
}

// ---------- Upload ----------
function ImportarTab({ caixaData, setCaixaData }) {
  const [conta, setConta] = useState("itau");
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function processarArquivos(files) {
    const lista = Array.from(files);
    if (!lista.length) return;
    const entradas = lista.map((f) => ({ id: uid(), filename: f.name, status: "processando", erro: null }));
    setUploads((prev) => [...prev, ...entradas]);

    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      const entrada = entradas[i];
      try {
        const { transacoes, saldos, rendimentos = [] } = await parseExtrato(file, conta);
        if (!transacoes.length && !saldos.length && !rendimentos.length) throw new Error("Nenhuma informação reconhecida neste arquivo.");
        setCaixaData((prev) => {
          const idsExistentes = new Set(prev.transacoes.map((t) => t.id));
          const novasTransacoes = transacoes.filter((t) => !idsExistentes.has(t.id));
          const mesesArquivo = [...new Set([...transacoes.map((t) => t.mes), ...rendimentos.map((r) => r.mes)])].sort();
          // um valor de rendimento por mês — reimportar substitui o valor anterior daquele mês
          const mesesRendimento = new Set(rendimentos.map((r) => r.mes));
          const rendimentosCaixinha = [
            ...prev.rendimentosCaixinha.filter((r) => !mesesRendimento.has(r.mes)),
            ...rendimentos,
          ];
          const novo = {
            ...prev,
            transacoes: [...prev.transacoes, ...novasTransacoes],
            saldosConhecidos: [...prev.saldosConhecidos, ...saldos],
            rendimentosCaixinha,
            arquivosImportados: [
              ...prev.arquivosImportados,
              { id: uid(), filename: file.name, conta, meses: mesesArquivo, qtdTransacoes: novasTransacoes.length, importadoEm: new Date().toISOString() },
            ],
          };
          salvarCaixa(novo);
          return novo;
        });
        setUploads((prev) => prev.map((u) => u.id === entrada.id ? { ...u, status: "concluido" } : u));
      } catch (e) {
        setUploads((prev) => prev.map((u) => u.id === entrada.id ? { ...u, status: "erro", erro: e.message } : u));
      }
    }
    setTimeout(() => setUploads((prev) => prev.filter((u) => u.status === "erro")), 4000);
  }

  function removerArquivo(registro) {
    setCaixaData((prev) => {
      const novo = {
        ...prev,
        transacoes: prev.transacoes.filter((t) => !(t.arquivo === registro.filename && t.conta === registro.conta)),
        saldosConhecidos: prev.saldosConhecidos.filter((s) => !(s.arquivo === registro.filename && s.conta === registro.conta)),
        rendimentosCaixinha: prev.rendimentosCaixinha.filter((r) => r.arquivo !== registro.filename),
        arquivosImportados: prev.arquivosImportados.filter((a) => a.id !== registro.id),
      };
      salvarCaixa(novo);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Conta do extrato a importar</label>
        <div className="flex gap-2 flex-wrap">
          {CONTAS.map((c) => (
            <button
              key={c.key}
              onClick={() => setConta(c.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={conta === c.key ? { background: CONTA_COR[c.key], color: "#fff" } : { background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); processarArquivos(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-xl p-8 text-center cursor-pointer transition-all"
        style={{ border: `2px dashed ${dragging ? C.blue : C.line}`, background: dragging ? C.blueSoft : C.card }}
      >
        <div style={{ color: dragging ? C.blue : C.inkSoft }}>
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            Arraste extratos de "{CONTA_LABEL[conta]}" aqui ou clique para selecionar
          </div>
          <div className="text-xs mt-1">
            {conta === "nubank_caixinha" ? "PDF (Extrato de Rendimentos) · OFX · CSV · XLS/XLSX"
              : conta === "c6_ka2" ? "PDF (Extrato C6) · OFX · CSV · XLS/XLSX"
              : "OFX · CSV · XLS/XLSX"}
          </div>
        </div>
        <input
          ref={fileInputRef} type="file" multiple accept=".ofx,.csv,.txt,.xls,.xlsx,.pdf" className="hidden"
          onChange={(e) => { processarArquivos(e.target.files); e.target.value = ""; }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u) => (
            <div key={u.id} className="rounded-lg px-4 py-2 text-sm flex items-center justify-between" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <span>{u.filename}</span>
              {u.status === "processando" && <span style={{ color: C.inkSoft }}>Processando…</span>}
              {u.status === "concluido" && <span style={{ color: C.green }}>Importado</span>}
              {u.status === "erro" && <span style={{ color: C.red }}>{u.erro}</span>}
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>Arquivos importados</div>
        {caixaData.arquivosImportados.length === 0 ? (
          <div className="text-sm py-6 text-center" style={{ color: C.inkSoft }}>Nenhum extrato importado ainda.</div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            {caixaData.arquivosImportados.slice().reverse().map((a, idx) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ background: C.card, borderTop: idx ? `1px solid ${C.line}` : "none" }}>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${CONTA_COR[a.conta]}22`, color: CONTA_COR[a.conta] }}>
                  {CONTA_LABEL[a.conta]}
                </span>
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="text-xs" style={{ color: C.inkSoft }}>{a.qtdTransacoes} lanç. · {(a.meses || []).map(fmtMes).join(", ")}</span>
                <button onClick={() => removerArquivo(a)} className="text-xs" style={{ color: C.red }}>excluir</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Evolução ----------
const CONTAS_PATRIMONIO = ["itau", "nubank", "nubank_caixinha", "c6_ka2"];

function EvolucaoTab({ caixaData }) {
  const patrimonio = useMemo(() => evolucaoMensal(caixaData.transacoes, caixaData.saldosConhecidos, CONTAS_PATRIMONIO), [caixaData]);

  if (!patrimonio.length) {
    return <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Importe extratos na aba "Importar" para ver a evolução do patrimônio.</div>;
  }

  const ultimo = patrimonio[patrimonio.length - 1];
  const anterior = patrimonio.length > 1 ? patrimonio[patrimonio.length - 2] : null;
  const variacao = anterior ? ultimo.total - anterior.total : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>Patrimônio total atual (Itaú + Nubank + Caixinha + KA2)</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color: C.ink }}>{fmtBRL(ultimo.total)}</div>
        </div>
        {variacao !== null && (
          <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>Variação vs. mês anterior</div>
            <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color: variacao >= 0 ? C.green : C.red }}>
              {variacao >= 0 ? "+" : ""}{fmtBRL(variacao)}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>Evolução do patrimônio total</div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={patrimonio}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={12} />
            <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
            <Tooltip formatter={(v) => fmtBRL(v)} labelFormatter={fmtMes} />
            <Legend />
            <Line type="monotone" dataKey="itau" name="Itaú" stroke={CONTA_COR.itau} strokeWidth={1.5} strokeOpacity={0.6} dot={false} />
            <Line type="monotone" dataKey="nubank" name="Nubank" stroke={CONTA_COR.nubank} strokeWidth={1.5} strokeOpacity={0.6} dot={false} />
            <Line type="monotone" dataKey="nubank_caixinha" name="Caixinha" stroke={CONTA_COR.nubank_caixinha} strokeWidth={1.5} strokeOpacity={0.6} dot={false} />
            <Line type="monotone" dataKey="c6_ka2" name="C6 (KA2)" stroke={CONTA_COR.c6_ka2} strokeWidth={1.5} strokeOpacity={0.6} dot={false} />
            <Line type="monotone" dataKey="total" name="Total (patrimônio)" stroke={C.ink} strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Débitos do extrato do mês (fora da caixinha) — usado para conciliar a "diferença" vs. o Financeiro
function debitosDoMes(caixaData, mes) {
  return caixaData.transacoes
    .filter((t) => t.mes === mes && t.tipo === "debito" && t.conta !== "nubank_caixinha")
    .slice()
    .sort((a, b) => b.valor - a.valor);
}

function MargemTab({ caixaData, financeiroData, ignoradas }) {
  const dados = useMemo(() => calcularResultadoMensal(caixaData, financeiroData, ignoradas), [caixaData, financeiroData, ignoradas]);
  const [mesExpandido, setMesExpandido] = useState(null);

  if (!dados.length) {
    return <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Importe extratos para calcular a margem líquida mensal.</div>;
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
          <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={12} />
          <YAxis yAxisId="valor" tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
          <YAxis yAxisId="pct" orientation="right" tickFormatter={(v) => `${v}%`} fontSize={11} width={50} />
          <Tooltip formatter={(v, name) => name === "Margem %" ? fmtPct(v) : fmtBRL(v)} labelFormatter={fmtMes} />
          <Legend />
          <Bar yAxisId="valor" dataKey="receita" name="Receita" fill={C.green} radius={[4, 4, 0, 0]} />
          <Bar yAxisId="valor" dataKey="despesaFinanceiro" name="Despesa (Financeiro)" fill={C.amber} radius={[4, 4, 0, 0]} />
          <Line yAxisId="pct" type="monotone" dataKey="margemPct" name="Margem %" stroke={C.blue} strokeWidth={2.5} dot />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.line}` }}>
              {["Mês", "Receita", "Despesa (Financeiro)", "Margem líquida", "Margem %", "Débitos extrato (conferência)", "Diferença", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-xs font-semibold uppercase text-right first:text-left" style={{ color: C.inkSoft }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => {
              const expandido = mesExpandido === d.mes;
              const debitos = expandido ? debitosDoMes(caixaData, d.mes) : [];
              return (
                <React.Fragment key={d.mes}>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td className="px-3 py-2 font-mono">{fmtMes(d.mes)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: C.green }}>{fmtBRL(d.receita)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: C.amber }}>{fmtBRL(d.despesaFinanceiro)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: d.margem >= 0 ? C.green : C.red }}>{fmtBRL(d.margem)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtPct(d.margemPct)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: C.inkSoft }}>{fmtBRL(d.despesaExtrato)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: Math.abs(d.diferenca) < 0.01 ? C.inkSoft : C.blue }}>{fmtBRL(d.diferenca)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setMesExpandido(expandido ? null : d.mes)}
                        className="text-xs font-bold px-2 py-1 rounded-lg"
                        style={{ color: C.blue, background: C.blueSoft }}
                      >
                        {expandido ? "Ocultar" : "Ver débitos"}
                      </button>
                    </td>
                  </tr>
                  {expandido && (
                    <tr>
                      <td colSpan={8} className="px-3 pb-3" style={{ background: C.bg }}>
                        {debitos.length === 0 ? (
                          <div className="text-xs py-3 text-center" style={{ color: C.inkSoft }}>Nenhum débito neste mês.</div>
                        ) : (
                          <div className="rounded-lg overflow-hidden mt-2" style={{ border: `1px solid ${C.line}` }}>
                            {debitos.map((t, idx) => (
                              <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-xs" style={{ background: C.card, borderTop: idx ? `1px solid ${C.line}` : "none" }}>
                                <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: `${CONTA_COR[t.conta]}22`, color: CONTA_COR[t.conta] }}>
                                  {CONTA_LABEL[t.conta]}
                                </span>
                                <span style={{ color: C.inkSoft, width: 60 }}>{t.data?.split("-").reverse().join("/")}</span>
                                <span className="flex-1 truncate">{t.descricao}</span>
                                <span className="font-mono font-bold" style={{ color: C.red }}>{fmtBRL(t.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs" style={{ color: C.inkSoft }}>
        "Ver débitos" mostra todos os débitos do extrato (Itaú, Nubank e C6/KA2) daquele mês, do maior para o menor — use para achar o que ainda falta cadastrar como fornecedor no Financeiro.
      </div>
    </div>
  );
}

function exportarExcel(caixaData, financeiroData, ignoradas) {
  const patrimonio = evolucaoMensal(caixaData.transacoes, caixaData.saldosConhecidos, CONTAS_PATRIMONIO);
  const margem = calcularResultadoMensal(caixaData, financeiroData, ignoradas);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(patrimonio.map((l) => ({
    Mês: fmtMes(l.mes), Itaú: l.itau, Nubank: l.nubank, Caixinha: l.nubank_caixinha, "C6 (KA2)": l.c6_ka2, Total: l.total,
  }))), "Evolução do Patrimônio");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(margem.map((m) => ({
    Mês: fmtMes(m.mes), Receita: m.receita, "Despesa (Financeiro)": m.despesaFinanceiro,
    "Margem líquida": m.margem, "Margem %": m.margemPct.toFixed(1), "Débitos extrato": m.despesaExtrato, Diferença: m.diferenca,
  }))), "Margem Líquida");
  XLSX.writeFile(wb, `caixa_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Caixa() {
  const [tab, setTab] = useState("importar");
  const [caixaData, setCaixaData] = useState({ transacoes: [], saldosConhecidos: [], rendimentosCaixinha: [], arquivosImportados: [] });
  const [financeiroData, setFinanceiroData] = useState({ fornecedores: [], ajustes: [] });
  const [ignoradas, setIgnoradas] = useState(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, f, cl] = await Promise.all([carregarCaixa(), carregarFinanceiro(), carregarClientes()]);
      setCaixaData(c);
      setFinanceiroData(f);
      setIgnoradas(new Set(cl.ignoradas));
      setLoaded(true);
    })();
  }, []);

  const totalTransacoes = caixaData.transacoes.length;
  const saldoAtualTotal = useMemo(() => {
    const mensal = evolucaoMensal(caixaData.transacoes, caixaData.saldosConhecidos, CONTAS_PATRIMONIO);
    return mensal.length ? mensal[mensal.length - 1].total : 0;
  }, [caixaData]);

  const tabs = [
    ["importar", "Importar extratos"],
    ["evolucao", "Evolução de caixa"],
    ["margem", "Margem líquida"],
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4" style={{ borderBottom: `3px solid ${C.blue}` }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.blue }}>Módulo Caixa</div>
            <h1 className="text-2xl font-bold mt-0.5">Evolução de caixa e margem líquida</h1>
          </div>
          <button
            onClick={() => exportarExcel(caixaData, financeiroData, ignoradas)}
            disabled={!totalTransacoes}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ color: C.green, background: C.greenSoft }}
          >
            Exportar Excel
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          {[
            ["Transações importadas", String(totalTransacoes), C.ink],
            ["Arquivos importados", String(caixaData.arquivosImportados.length), C.blue],
            ["Saldo total estimado", fmtBRL(saldoAtualTotal), C.green],
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
              style={tab === k ? { background: C.card, color: C.blue, borderBottom: `2px solid ${C.blue}` } : { color: C.inkSoft }}
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
              {tab === "importar" && <ImportarTab caixaData={caixaData} setCaixaData={setCaixaData} />}
              {tab === "evolucao" && <EvolucaoTab caixaData={caixaData} />}
              {tab === "margem" && <MargemTab caixaData={caixaData} financeiroData={financeiroData} ignoradas={ignoradas} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
