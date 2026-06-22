import React, { useState, useEffect, useRef, useMemo } from "react";

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
  purpleSoft: "#EDE9F5",
};

const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMes(ym) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return `${MESES_LABEL[parseInt(m, 10) - 1]}/${y}`;
}

const Th = ({ children, right }) => (
  <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${right ? "text-right" : "text-left"}`} style={{ color: C.inkSoft }}>
    {children}
  </th>
);
const Td = ({ children, right, mono, colSpan }) => (
  <td colSpan={colSpan} className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: C.ink }}>
    {children}
  </td>
);

const Chip = ({ tone, children }) => {
  const map = { green: [C.greenSoft, C.green], amber: [C.amberSoft, C.amber], red: [C.redSoft, C.red], blue: [C.blueSoft, C.blue], purple: [C.purpleSoft, C.purple], gray: ["#EEF1F0", C.inkSoft] };
  const [bg, fg] = map[tone] || map.gray;
  return <span style={{ background: bg, color: fg }} className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">{children}</span>;
};

const parseValorInput = (s) => {
  if (!s) return 0;
  const clean = String(s).replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

const norm = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// ---------- Formulário de Fornecedor ----------
function FormFornecedor({ inicial, onSalvar, onCancelar, sugestoes = [] }) {
  const [nome, setNome] = useState(inicial?.nome || "");
  const [cnpj, setCnpj] = useState(inicial?.cnpj || "");
  const [categoria, setCategoria] = useState(inicial?.categoria || "");
  const [valorBruto, setValorBruto] = useState(inicial ? String(inicial.valorBruto).replace(".", ",") : "");
  const [descontos, setDescontos] = useState(inicial?.descontos || []);
  const [novoDescDesc, setNovoDescDesc] = useState("");
  const [novoDescVal, setNovoDescVal] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const inputNomeRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filtra sugestões pelo texto digitado
  const sugestoesFiltradas = useMemo(() => {
    if (!nome.trim()) return sugestoes;
    const q = norm(nome);
    return sugestoes.filter((s) => norm(s.fornecedor).includes(q));
  }, [nome, sugestoes]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputNomeRef.current && !inputNomeRef.current.contains(e.target)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function importarSugestao(s) {
    setNome(s.fornecedor);
    setCnpj(s.cnpj || "");
    setDropdownAberto(false);
    // foca no campo de valor bruto para o usuário completar
    setTimeout(() => {
      const el = document.getElementById("campo-valor-bruto");
      if (el) el.focus();
    }, 50);
  }

  const totalDescontos = descontos.reduce((s, d) => s + d.valor, 0);
  const bruto = parseValorInput(valorBruto);
  const liquido = Math.max(0, bruto - totalDescontos);

  function addDesconto() {
    if (!novoDescDesc.trim() || !novoDescVal.trim()) return;
    const v = parseValorInput(novoDescVal);
    if (!v) return;
    setDescontos((prev) => [...prev, { id: uid(), descricao: novoDescDesc.trim(), valor: v }]);
    setNovoDescDesc("");
    setNovoDescVal("");
  }

  function salvar() {
    if (!nome.trim()) return;
    onSalvar({
      id: inicial?.id || uid(),
      nome: nome.trim(),
      cnpj: cnpj.trim(),
      categoria: categoria.trim(),
      valorBruto: bruto,
      descontos,
    });
  }

  return (
    <div className="space-y-4 p-4 rounded-xl" style={{ border: `1px solid ${C.line}`, background: C.card }}>
      <h3 className="font-bold text-sm" style={{ color: C.ink }}>{inicial ? "Editar fornecedor" : "Novo fornecedor / empresa"}</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
            Nome / Razão social *
            {sugestoes.length > 0 && (
              <span className="ml-2 font-normal" style={{ color: C.blue }}>
                {sugestoes.length} sugestão(ões) da conciliação disponível(is)
              </span>
            )}
          </label>
          <div style={{ position: "relative" }}>
            <input
              ref={inputNomeRef}
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{ border: `1px solid ${dropdownAberto && sugestoesFiltradas.length ? C.blue : C.line}`, background: "#fff" }}
              value={nome}
              onChange={(e) => { setNome(e.target.value); setDropdownAberto(true); }}
              onFocus={() => setDropdownAberto(true)}
              placeholder="Digite ou selecione da conciliação…"
            />
            {dropdownAberto && sugestoesFiltradas.length > 0 && (
              <div
                ref={dropdownRef}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: C.card,
                  border: `1px solid ${C.blue}`,
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 100,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: C.blue, borderBottom: `1px solid ${C.line}` }}>
                  Fornecedores da conciliação — clique para importar
                </div>
                {sugestoesFiltradas.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); importarSugestao(s); }}
                    style={{ display: "flex", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", borderBottom: `1px solid ${C.line}`, gap: 12, alignItems: "center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.blueSoft; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-sm font-semibold" style={{ color: C.ink }}>{s.fornecedor}</div>
                      <div className="text-xs" style={{ color: C.inkSoft }}>
                        {s.cnpj ? `CNPJ: ${s.cnpj}  ·  ` : ""}{s.notas} nota(s)  ·  Total {fmtBRL(s.totalNotas)}
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: C.blueSoft, color: C.blue, whiteSpace: "nowrap" }}>
                      Importar
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>CNPJ / CPF</label>
          <input
            className="w-full text-sm rounded-lg px-3 py-2 font-mono"
            style={{ border: `1px solid ${C.line}`, background: "#fff" }}
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0001-00"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Categoria</label>
          <input
            className="w-full text-sm rounded-lg px-3 py-2"
            style={{ border: `1px solid ${C.line}`, background: "#fff" }}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ex: Software, Aluguel, Folha, Contabilidade…"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Valor bruto mensal (R$)</label>
          <input
            id="campo-valor-bruto"
            className="w-full text-sm rounded-lg px-3 py-2 font-mono"
            style={{ border: `1px solid ${C.line}`, background: "#fff" }}
            value={valorBruto}
            onChange={(e) => setValorBruto(e.target.value)}
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Descontos */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>
          Descontos mensais regulares
        </div>
        {descontos.length > 0 && (
          <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${C.line}` }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: C.bg }}>
                  <Th>Descrição</Th>
                  <Th right>Valor</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {descontos.map((d) => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <Td>
                      <input
                        className="text-xs rounded px-2 py-1 w-full"
                        style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                        value={d.descricao}
                        onChange={(e) => setDescontos((prev) => prev.map((x) => x.id === d.id ? { ...x, descricao: e.target.value } : x))}
                      />
                    </Td>
                    <Td right mono>
                      <input
                        className="text-xs rounded px-2 py-1 text-right w-28"
                        style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                        value={String(d.valor).replace(".", ",")}
                        onChange={(e) => {
                          const v = parseValorInput(e.target.value);
                          setDescontos((prev) => prev.map((x) => x.id === d.id ? { ...x, valor: v } : x));
                        }}
                      />
                    </Td>
                    <Td right>
                      <button className="text-xs" style={{ color: C.red }} onClick={() => setDescontos((prev) => prev.filter((x) => x.id !== d.id))}>
                        remover
                      </button>
                    </Td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.line}`, background: C.amberSoft }}>
                  <Td><span className="font-semibold text-xs">Total descontos</span></Td>
                  <Td right mono><span style={{ color: C.amber }} className="font-bold">{fmtBRL(totalDescontos)}</span></Td>
                  <Td></Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Add desconto */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              className="w-full text-xs rounded-lg px-2 py-1.5"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              placeholder="Descrição do desconto (ex: INSS, IR, plano de saúde…)"
              value={novoDescDesc}
              onChange={(e) => setNovoDescDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addDesconto(); }}
            />
          </div>
          <div className="w-28">
            <input
              className="w-full text-xs rounded-lg px-2 py-1.5 font-mono text-right"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              placeholder="0,00"
              value={novoDescVal}
              onChange={(e) => setNovoDescVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addDesconto(); }}
            />
          </div>
          <button
            onClick={addDesconto}
            className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: C.greenSoft, color: C.green, whiteSpace: "nowrap" }}
          >
            + Desconto
          </button>
        </div>
      </div>

      {/* Resumo */}
      {bruto > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Valor bruto", fmtBRL(bruto), C.ink],
            ["(-) Descontos", fmtBRL(totalDescontos), C.amber],
            ["= Valor líquido", fmtBRL(liquido), C.green],
          ].map(([label, v, color]) => (
            <div key={label} className="rounded-lg p-2 text-center" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
              <div className="text-xs" style={{ color: C.inkSoft }}>{label}</div>
              <div className="font-bold font-mono mt-0.5" style={{ color }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={salvar}
          disabled={!nome.trim()}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
          style={{ background: C.green }}
        >
          {inicial ? "Salvar alterações" : "Cadastrar"}
        </button>
        <button
          onClick={onCancelar}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "#EEF1F0", color: C.inkSoft }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------- Modal de Abono/Desconto Mensal ----------
function ModalAjuste({ fornecedores, ajustes, onSalvar, onFechar }) {
  const [fornId, setFornId] = useState("");
  const [mes, setMes] = useState(mesAtual());
  const [tipo, setTipo] = useState("desconto");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");

  function salvar() {
    if (!fornId || !descricao.trim() || !valor) return;
    const v = parseValorInput(valor);
    if (!v) return;
    onSalvar({ id: uid(), fornecedorId: fornId, mes, tipo, descricao: descricao.trim(), valor: v });
    setDescricao("");
    setValor("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onFechar}>
      <div className="rounded-xl w-full max-w-lg" style={{ background: C.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h2 className="font-bold text-base">Novo ajuste mensal</h2>
          <button onClick={onFechar} style={{ color: C.inkSoft }}>✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Fornecedor *</label>
            <select
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              value={fornId}
              onChange={(e) => setFornId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Mês de referência</label>
              <input
                type="month"
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Tipo</label>
              <select
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="desconto">Desconto pontual</option>
                <option value="abono">Abono / Acréscimo</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Descrição *</label>
            <input
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: férias, 13º proporcional, acerto de diferença…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Valor (R$) *</label>
            <input
              className="w-full text-sm rounded-lg px-3 py-2 font-mono"
              style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <button
            onClick={salvar}
            disabled={!fornId || !descricao.trim() || !valor}
            className="w-full py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
            style={{ background: tipo === "abono" ? C.blue : C.amber }}
          >
            {tipo === "abono" ? "Registrar abono" : "Registrar desconto"}
          </button>
        </div>

        {/* Lista existente */}
        {ajustes.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>Ajustes cadastrados</div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, maxHeight: 220, overflowY: "auto" }}>
              <table className="w-full">
                <thead><tr style={{ background: C.bg }}>
                  <Th>Mês</Th><Th>Fornecedor</Th><Th>Descrição</Th><Th>Tipo</Th><Th right>Valor</Th><Th></Th>
                </tr></thead>
                <tbody>
                  {ajustes.slice().sort((a, b) => b.mes.localeCompare(a.mes)).map((a) => {
                    const f = fornecedores.find((x) => x.id === a.fornecedorId);
                    return (
                      <tr key={a.id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <Td mono>{fmtMes(a.mes)}</Td>
                        <Td>{f?.nome || "—"}</Td>
                        <Td>{a.descricao}</Td>
                        <Td><Chip tone={a.tipo === "abono" ? "blue" : "amber"}>{a.tipo === "abono" ? "Abono" : "Desconto"}</Chip></Td>
                        <Td right mono>
                          <span style={{ color: a.tipo === "abono" ? C.blue : C.amber }}>{fmtBRL(a.valor)}</span>
                        </Td>
                        <Td right>
                          <button className="text-xs" style={{ color: C.red }} onClick={() => onSalvar(null, a.id)}>x</button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main ----------
export default function Financeiro() {
  const [tab, setTab] = useState("fornecedores");
  const [fornecedores, setFornecedores] = useState([]);
  const [ajustes, setAjustes] = useState([]); // descontos/abonos pontuais por mês
  const [loaded, setLoaded] = useState(false);
  const [editando, setEditando] = useState(null); // null | fornecedor objeto
  const [criando, setCriando] = useState(false);
  const [modalAjuste, setModalAjuste] = useState(false);
  const [mesSel, setMesSel] = useState(mesAtual());
  const [conciliacaoData, setConciliacaoData] = useState(null); // dados do módulo de conciliação
  const saveTimer = useRef(null);

  // Carregar dados
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/storage?key=financeiro%3Av1", { credentials: "include" });
        if (r.ok) {
          const { value } = await r.json();
          if (value) {
            const d = JSON.parse(value);
            setFornecedores(d.fornecedores || []);
            setAjustes(d.ajustes || []);
          }
        }
        // Carregar dados de conciliação para comparativo
        const r2 = await fetch("/api/storage?key=conciliacao%3Av1", { credentials: "include" });
        if (r2.ok) {
          const { value: v2 } = await r2.json();
          if (v2) setConciliacaoData(JSON.parse(v2));
        }
      } catch (e) { /* primeira vez */ }
      setLoaded(true);
    })();
  }, []);

  // Salvar
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ key: "financeiro:v1", value: JSON.stringify({ fornecedores, ajustes }) }),
        });
      } catch (e) { console.error("Falha ao salvar financeiro", e); }
    }, 600);
  }, [fornecedores, ajustes, loaded]);

  function salvarFornecedor(f) {
    setFornecedores((prev) => {
      const idx = prev.findIndex((x) => x.id === f.id);
      if (idx >= 0) return prev.map((x) => x.id === f.id ? f : x);
      return [...prev, f];
    });
    setCriando(false);
    setEditando(null);
  }

  function excluirFornecedor(id) {
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    setAjustes((prev) => prev.filter((a) => a.fornecedorId !== id));
  }

  function handleAjuste(novoAjuste, removerId) {
    if (removerId) {
      setAjustes((prev) => prev.filter((a) => a.id !== removerId));
      return;
    }
    if (novoAjuste) {
      setAjustes((prev) => [...prev, novoAjuste]);
    }
  }

  // Provisão do mês selecionado
  const provisaoMes = useMemo(() => {
    return fornecedores.map((f) => {
      const totalDescontos = f.descontos.reduce((s, d) => s + d.valor, 0);
      const ajustesMes = ajustes.filter((a) => a.fornecedorId === f.id && a.mes === mesSel);
      const totalDescPontuais = ajustesMes.filter((a) => a.tipo === "desconto").reduce((s, a) => s + a.valor, 0);
      const totalAbonos = ajustesMes.filter((a) => a.tipo === "abono").reduce((s, a) => s + a.valor, 0);
      const provisao = Math.max(0, f.valorBruto - totalDescontos - totalDescPontuais + totalAbonos);

      // Notas emitidas no mês (comparativo)
      const notasMes = conciliacaoData?.invoices?.filter((inv) => {
        const mesNota = (inv.dataEmissao || "").slice(0, 7);
        const nomeNorm = (inv.fornecedor || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const fNorm = (f.nome || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const cnpjMatch = f.cnpj && inv.cnpj && inv.cnpj.replace(/\D/g, "") === f.cnpj.replace(/\D/g, "");
        const nomeMatch = fNorm.length > 3 && nomeNorm.includes(fNorm.slice(0, Math.min(fNorm.length, 8)));
        return mesNota === mesSel && (cnpjMatch || nomeMatch);
      }) || [];

      const totalNotasMes = notasMes.reduce((s, n) => s + n.valor, 0);
      const diff = totalNotasMes - provisao;

      return {
        f,
        totalDescontos,
        ajustesMes,
        totalDescPontuais,
        totalAbonos,
        provisao,
        notasMes,
        totalNotasMes,
        diff,
      };
    });
  }, [fornecedores, ajustes, mesSel, conciliacaoData]);

  const totalProvisao = provisaoMes.reduce((s, p) => s + p.provisao, 0);
  const totalNotasMes = provisaoMes.reduce((s, p) => s + p.totalNotasMes, 0);

  // Sugestões: fornecedores do relatório de conciliação ainda não cadastrados em Financeiro
  const sugestoesConciliacao = useMemo(() => {
    if (!conciliacaoData?.invoices?.length) return [];
    // Agrupa notas por CNPJ ou nome (mesmo algoritmo do "Por fornecedor")
    const grupos = {};
    conciliacaoData.invoices.forEach((inv) => {
      const key = inv.cnpj || norm(inv.fornecedor);
      if (!grupos[key]) grupos[key] = { key, fornecedor: inv.fornecedor, cnpj: inv.cnpj || "", notas: 0, totalNotas: 0 };
      grupos[key].notas += 1;
      grupos[key].totalNotas += inv.valor;
    });
    // Filtra os que já estão cadastrados (por CNPJ ou nome normalizado)
    const jaRegistradosCnpj = new Set(fornecedores.map((f) => f.cnpj?.replace(/\D/g, "")).filter(Boolean));
    const jaRegistradosNome = new Set(fornecedores.map((f) => norm(f.nome)));
    return Object.values(grupos).filter((g) => {
      const cnpjLimpo = g.cnpj.replace(/\D/g, "");
      if (cnpjLimpo && jaRegistradosCnpj.has(cnpjLimpo)) return false;
      if (jaRegistradosNome.has(norm(g.fornecedor))) return false;
      return true;
    }).sort((a, b) => b.totalNotas - a.totalNotas);
  }, [conciliacaoData, fornecedores]);

  // Meses disponíveis para seleção
  const mesesDisponiveis = useMemo(() => {
    const d = new Date();
    const meses = [];
    for (let i = -2; i <= 3; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() + i, 1);
      meses.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
    }
    return meses;
  }, []);

  const tabs = [
    ["fornecedores", `Fornecedores (${fornecedores.length})`],
    ["provisao", "Provisão mensal"],
    ["ajustes", `Descontos e Abonos (${ajustes.length})`],
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4" style={{ borderBottom: `3px solid ${C.blue}` }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.blue }}>Módulo Financeiro</div>
            <h1 className="text-2xl font-bold mt-0.5">Cadastro de fornecedores e provisões</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModalAjuste(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ color: C.amber, background: C.amberSoft }}
            >
              + Desconto / Abono
            </button>
            <button
              onClick={() => { setCriando(true); setEditando(null); }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
              style={{ background: C.blue }}
            >
              + Novo fornecedor
            </button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            ["Fornecedores cadastrados", String(fornecedores.length), C.ink],
            ["Provisão bruta total (mês)", fmtBRL(fornecedores.reduce((s, f) => s + f.valorBruto, 0)), C.blue],
            ["Provisão líquida (mês)", fmtBRL(totalProvisao), C.green],
            ["Notas emitidas no mês", fmtBRL(totalNotasMes), conciliacaoData ? C.purple : C.inkSoft],
          ].map(([label, v, color]) => (
            <div key={label} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
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

          {/* ---- FORNECEDORES ---- */}
          {tab === "fornecedores" && (
            <div className="space-y-4">
              {criando && (
                <FormFornecedor
                  onSalvar={salvarFornecedor}
                  onCancelar={() => setCriando(false)}
                  sugestoes={sugestoesConciliacao}
                />
              )}

              {!criando && !editando && fornecedores.length === 0 && (
                <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>
                  Nenhum fornecedor cadastrado. Clique em "Novo fornecedor" para começar.
                </div>
              )}

              {editando && (
                <FormFornecedor
                  inicial={editando}
                  onSalvar={salvarFornecedor}
                  onCancelar={() => setEditando(null)}
                  sugestoes={sugestoesConciliacao}
                />
              )}

              {!criando && !editando && fornecedores.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                        <Th>Nome / Razão social</Th>
                        <Th>CNPJ / CPF</Th>
                        <Th>Categoria</Th>
                        <Th right>Valor bruto</Th>
                        <Th right>(-) Descontos</Th>
                        <Th right>= Líquido</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {fornecedores.map((f) => {
                        const totalDesc = f.descontos.reduce((s, d) => s + d.valor, 0);
                        const liquido = Math.max(0, f.valorBruto - totalDesc);
                        return (
                          <tr key={f.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                            <Td>
                              <div className="font-semibold">{f.nome}</div>
                              {f.categoria && <div className="text-xs" style={{ color: C.inkSoft }}>{f.categoria}</div>}
                            </Td>
                            <Td mono>{f.cnpj || "—"}</Td>
                            <Td>{f.categoria || "—"}</Td>
                            <Td right mono>{fmtBRL(f.valorBruto)}</Td>
                            <Td right mono>
                              {totalDesc > 0 ? (
                                <span style={{ color: C.amber }}>({fmtBRL(totalDesc)})</span>
                              ) : "—"}
                            </Td>
                            <Td right mono>
                              <span className="font-bold" style={{ color: C.green }}>{fmtBRL(liquido)}</span>
                            </Td>
                            <Td right>
                              <div className="flex gap-2 justify-end">
                                <button
                                  className="text-xs font-bold px-2 py-1 rounded-lg"
                                  style={{ color: C.blue, background: C.blueSoft }}
                                  onClick={() => { setEditando(f); setCriando(false); }}
                                >
                                  Editar
                                </button>
                                <button
                                  className="text-xs"
                                  style={{ color: C.red }}
                                  onClick={() => {
                                    if (confirm(`Excluir "${f.nome}"? Os ajustes mensais também serão removidos.`)) {
                                      excluirFornecedor(f.id);
                                    }
                                  }}
                                >
                                  excluir
                                </button>
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.line}`, background: C.bg }}>
                        <Td colSpan={3}><span className="font-bold text-xs uppercase tracking-wide">Total geral</span></Td>
                        <Td right mono><span className="font-bold">{fmtBRL(fornecedores.reduce((s, f) => s + f.valorBruto, 0))}</span></Td>
                        <Td right mono><span style={{ color: C.amber }}>({fmtBRL(fornecedores.reduce((s, f) => s + f.descontos.reduce((ss, d) => ss + d.valor, 0), 0))})</span></Td>
                        <Td right mono><span className="font-bold" style={{ color: C.green }}>{fmtBRL(fornecedores.reduce((s, f) => s + Math.max(0, f.valorBruto - f.descontos.reduce((ss, d) => ss + d.valor, 0)), 0))}</span></Td>
                        <Td></Td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---- PROVISÃO MENSAL ---- */}
          {tab === "provisao" && (
            <div className="space-y-4">
              {/* Seletor de mês */}
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.inkSoft }}>Mês de referência</div>
                  <select
                    className="text-sm rounded-lg px-3 py-1.5"
                    style={{ border: `1px solid ${C.line}`, background: "#fff", minWidth: 160 }}
                    value={mesSel}
                    onChange={(e) => setMesSel(e.target.value)}
                  >
                    {mesesDisponiveis.map((m) => (
                      <option key={m} value={m}>{fmtMes(m)}</option>
                    ))}
                  </select>
                </div>
                {!conciliacaoData && (
                  <div className="text-xs px-3 py-2 rounded-lg" style={{ background: C.amberSoft, color: C.amber }}>
                    Nenhum dado de conciliação carregado — importe notas no módulo "Conciliação Financeira" para ver o comparativo.
                  </div>
                )}
              </div>

              {/* Resumo do mês */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Provisão bruta", fmtBRL(provisaoMes.reduce((s, p) => s + p.f.valorBruto, 0)), C.ink],
                  ["Provisão líquida", fmtBRL(totalProvisao), C.green],
                  ["Notas emitidas", fmtBRL(totalNotasMes), C.purple],
                ].map(([label, v, color]) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
                    <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color }}>{v}</div>
                  </div>
                ))}
              </div>

              {fornecedores.length === 0 ? (
                <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>
                  Cadastre fornecedores na aba "Fornecedores" para ver a provisão mensal.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                        <Th>Fornecedor</Th>
                        <Th right>Bruto</Th>
                        <Th right>Desc. fixos</Th>
                        <Th right>Ajustes {fmtMes(mesSel)}</Th>
                        <Th right>Provisão líquida</Th>
                        <Th right>Nota emitida</Th>
                        <Th right>Diferença</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {provisaoMes.map(({ f, totalDescontos, totalDescPontuais, totalAbonos, provisao, totalNotasMes, diff }) => {
                        const ajusteNet = totalAbonos - totalDescPontuais;
                        const diffColor = Math.abs(diff) < 0.01 ? C.green : diff > 0 ? C.blue : C.red;
                        return (
                          <tr key={f.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                            <Td>
                              <div className="font-semibold">{f.nome}</div>
                              {f.categoria && <div className="text-xs" style={{ color: C.inkSoft }}>{f.categoria}</div>}
                            </Td>
                            <Td right mono>{fmtBRL(f.valorBruto)}</Td>
                            <Td right mono>
                              {totalDescontos > 0 ? <span style={{ color: C.amber }}>({fmtBRL(totalDescontos)})</span> : "—"}
                            </Td>
                            <Td right mono>
                              {ajusteNet !== 0 ? (
                                <span style={{ color: ajusteNet > 0 ? C.blue : C.amber }}>
                                  {ajusteNet > 0 ? "+" : ""}{fmtBRL(ajusteNet)}
                                </span>
                              ) : "—"}
                            </Td>
                            <Td right mono>
                              <span className="font-bold" style={{ color: C.green }}>{fmtBRL(provisao)}</span>
                            </Td>
                            <Td right mono>
                              {totalNotasMes > 0 ? fmtBRL(totalNotasMes) : <span style={{ color: C.inkSoft }}>—</span>}
                            </Td>
                            <Td right mono>
                              {totalNotasMes > 0 ? (
                                <span style={{ color: diffColor }} className="font-bold">
                                  {diff > 0 ? "+" : ""}{fmtBRL(diff)}
                                </span>
                              ) : <span style={{ color: C.inkSoft }}>—</span>}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.line}`, background: C.bg }}>
                        <Td><span className="font-bold text-xs uppercase tracking-wide">Total</span></Td>
                        <Td right mono><span className="font-bold">{fmtBRL(fornecedores.reduce((s, f) => s + f.valorBruto, 0))}</span></Td>
                        <Td right mono></Td>
                        <Td right mono></Td>
                        <Td right mono><span className="font-bold" style={{ color: C.green }}>{fmtBRL(totalProvisao)}</span></Td>
                        <Td right mono><span className="font-bold" style={{ color: C.purple }}>{fmtBRL(totalNotasMes)}</span></Td>
                        <Td right mono>
                          {totalNotasMes > 0 && (
                            <span className="font-bold" style={{ color: Math.abs(totalNotasMes - totalProvisao) < 0.01 ? C.green : C.amber }}>
                              {totalNotasMes - totalProvisao > 0 ? "+" : ""}{fmtBRL(totalNotasMes - totalProvisao)}
                            </span>
                          )}
                        </Td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---- DESCONTOS E ABONOS ---- */}
          {tab === "ajustes" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm" style={{ color: C.inkSoft }}>
                  Descontos e abonos pontuais aplicados em um mês específico.
                </div>
                <button
                  onClick={() => setModalAjuste(true)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ color: C.amber, background: C.amberSoft }}
                >
                  + Novo ajuste
                </button>
              </div>

              {ajustes.length === 0 ? (
                <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>
                  Nenhum ajuste cadastrado. Clique em "+ Novo ajuste" para registrar um desconto ou abono.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                        <Th>Mês</Th>
                        <Th>Fornecedor</Th>
                        <Th>Descrição</Th>
                        <Th>Tipo</Th>
                        <Th right>Valor</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ajustes
                        .slice()
                        .sort((a, b) => b.mes.localeCompare(a.mes))
                        .map((a) => {
                          const f = fornecedores.find((x) => x.id === a.fornecedorId);
                          return (
                            <tr key={a.id} style={{ borderBottom: `1px solid ${C.line}`, background: a.tipo === "abono" ? C.blueSoft : C.amberSoft }}>
                              <Td mono>{fmtMes(a.mes)}</Td>
                              <Td>{f?.nome || <span style={{ color: C.red }}>Fornecedor removido</span>}</Td>
                              <Td>{a.descricao}</Td>
                              <Td>
                                <Chip tone={a.tipo === "abono" ? "blue" : "amber"}>
                                  {a.tipo === "abono" ? "Abono / Acréscimo" : "Desconto pontual"}
                                </Chip>
                              </Td>
                              <Td right mono>
                                <span className="font-bold" style={{ color: a.tipo === "abono" ? C.blue : C.amber }}>
                                  {a.tipo === "abono" ? "+" : "-"}{fmtBRL(a.valor)}
                                </span>
                              </Td>
                              <Td right>
                                <button
                                  className="text-xs"
                                  style={{ color: C.red }}
                                  onClick={() => handleAjuste(null, a.id)}
                                >
                                  excluir
                                </button>
                              </Td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-xs mt-4 text-center" style={{ color: C.inkSoft }}>
          Os dados são salvos automaticamente. A provisão mensal é calculada como: Valor bruto − Descontos fixos ± Ajustes do mês.
        </div>
      </div>

      {modalAjuste && (
        <ModalAjuste
          fornecedores={fornecedores}
          ajustes={ajustes}
          onSalvar={handleAjuste}
          onFechar={() => setModalAjuste(false)}
        />
      )}
    </div>
  );
}
