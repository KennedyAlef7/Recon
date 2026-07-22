import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { carregarCaixa, carregarFinanceiro, carregarClientes } from "./lib/caixaStore.js";
import { calcularResultadoMensal, agruparPorTrimestre, SEM_CATEGORIA } from "./lib/resultado.js";

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

const PALETA_CATEGORIAS = ["#1F4E79", "#9A6A12", "#5B2D8E", "#0E7C86", "#A93226", "#B7590C", "#2E7D32", "#8E44AD", "#C2185B"];
const COR_SEM_CATEGORIA = "#B0B8B5";

const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;
const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmtMes = (ym) => {
  if (!ym || ym === "total") return "Total do período";
  const [y, m] = ym.split("-");
  return `${MESES_LABEL[parseInt(m, 10) - 1]}/${y}`;
};

// Formata tanto chave de mês ("2026-06") quanto de trimestre ("2026-Q2")
const fmtPeriodo = (chave) => {
  if (!chave || chave === "total") return "Total do período";
  if (chave.includes("-Q")) {
    const [y, q] = chave.split("-Q");
    return `${q}º Tri/${y}`;
  }
  return fmtMes(chave);
};

function exportarExcel(dados, categoriasUnicas, granularidade) {
  const resultado = dados.map((d) => ({
    Período: fmtPeriodo(d.mes),
    Receita: d.receita,
    Despesa: d.despesaFinanceiro,
    "Margem líquida": d.margem,
    "Margem %": d.margemPct.toFixed(1),
    "Débitos extrato (conferência)": d.despesaExtrato,
  }));

  const porCategoria = [];
  dados.forEach((d) => {
    categoriasUnicas.forEach((cat) => {
      const valor = d.porCategoria[cat] || 0;
      if (valor) porCategoria.push({ Período: fmtPeriodo(d.mes), Categoria: cat, Valor: valor });
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado), granularidade === "trimestral" ? "Resultado Trimestral" : "Resultado Mensal");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porCategoria), "Despesas por Categoria");
  XLSX.writeFile(wb, `resultados_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Resultados() {
  const [caixaData, setCaixaData] = useState({ transacoes: [], saldosConhecidos: [] });
  const [financeiroData, setFinanceiroData] = useState({ fornecedores: [], ajustes: [] });
  const [ignoradas, setIgnoradas] = useState(new Set());
  const [loaded, setLoaded] = useState(false);
  const [mesSel, setMesSel] = useState("total");
  const [granularidade, setGranularidade] = useState("mensal");

  useEffect(() => {
    (async () => {
      const [cx, f, cl] = await Promise.all([carregarCaixa(), carregarFinanceiro(), carregarClientes()]);
      setCaixaData(cx);
      setFinanceiroData(f);
      setIgnoradas(new Set(cl.ignoradas));
      setLoaded(true);
    })();
  }, []);

  const debitosIgnorados = useMemo(() => new Set(caixaData.debitosIgnorados), [caixaData.debitosIgnorados]);

  const dados = useMemo(
    () => calcularResultadoMensal(caixaData, financeiroData, ignoradas, debitosIgnorados),
    [caixaData, financeiroData, ignoradas, debitosIgnorados]
  );

  const dadosExibidos = useMemo(
    () => granularidade === "trimestral" ? agruparPorTrimestre(dados) : dados,
    [dados, granularidade]
  );

  // Ordem estável das categorias (não depende de ranking/valor) — cor sempre segue a categoria, nunca a posição
  const categoriasUnicas = useMemo(() => {
    const nomes = new Set();
    dadosExibidos.forEach((d) => Object.keys(d.porCategoria).forEach((c) => nomes.add(c)));
    return [...nomes].sort();
  }, [dadosExibidos]);
  const corPorCategoria = (cat) => cat === SEM_CATEGORIA ? COR_SEM_CATEGORIA : PALETA_CATEGORIAS[categoriasUnicas.indexOf(cat) % PALETA_CATEGORIAS.length];

  const chartData = useMemo(() => dadosExibidos.map((d) => {
    const linha = { mes: d.mes, receita: d.receita };
    categoriasUnicas.forEach((cat) => { linha[cat] = d.porCategoria[cat] || 0; });
    return linha;
  }), [dadosExibidos, categoriasUnicas]);

  const resumo = useMemo(() => {
    if (mesSel === "total") {
      const receita = dadosExibidos.reduce((s, d) => s + d.receita, 0);
      const despesa = dadosExibidos.reduce((s, d) => s + d.despesaFinanceiro, 0);
      const margem = receita - despesa;
      return { receita, despesa, margem, margemPct: receita > 0 ? (margem / receita) * 100 : 0, diferenca: dadosExibidos.reduce((s, d) => s + d.diferenca, 0) };
    }
    const d = dadosExibidos.find((x) => x.mes === mesSel);
    return d
      ? { receita: d.receita, despesa: d.despesaFinanceiro, margem: d.margem, margemPct: d.margemPct, diferenca: d.diferenca }
      : { receita: 0, despesa: 0, margem: 0, margemPct: 0, diferenca: 0 };
  }, [dadosExibidos, mesSel]);

  const rankingCategorias = useMemo(() => {
    const linhas = mesSel === "total" ? dadosExibidos : dadosExibidos.filter((d) => d.mes === mesSel);
    const totais = {};
    linhas.forEach((d) => Object.entries(d.porCategoria).forEach(([cat, v]) => { totais[cat] = (totais[cat] || 0) + v; }));
    const despesaTotal = Object.values(totais).reduce((s, v) => s + v, 0);
    return Object.entries(totais)
      .map(([categoria, valor]) => ({ categoria, valor, pct: despesaTotal > 0 ? (valor / despesaTotal) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [dadosExibidos, mesSel]);

  function trocarGranularidade(g) {
    setGranularidade(g);
    setMesSel("total"); // chaves de mês e de trimestre não coincidem — evita ficar com um período inexistente selecionado
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4" style={{ borderBottom: `3px solid ${C.amber}` }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.amber }}>Módulo Resultados</div>
            <h1 className="text-2xl font-bold mt-0.5">Receita x despesa por categoria e margem líquida</h1>
          </div>
          <button
            onClick={() => exportarExcel(dadosExibidos, categoriasUnicas, granularidade)}
            disabled={!dados.length}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ color: C.green, background: C.greenSoft }}
          >
            Exportar Excel
          </button>
        </div>

        {!loaded ? (
          <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>Carregando…</div>
        ) : !dados.length ? (
          <div className="text-sm py-12 text-center" style={{ color: C.inkSoft }}>
            Sem dados ainda — importe extratos no módulo "Caixa" e cadastre fornecedores no módulo "Financeiro" para ver os resultados aqui.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-4 mt-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Apuração</label>
                <div className="flex gap-1">
                  {[["mensal", "Mensal"], ["trimestral", "Trimestral"]].map(([g, label]) => (
                    <button
                      key={g}
                      onClick={() => trocarGranularidade(g)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={granularidade === g ? { background: C.amber, color: "#fff" } : { background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Período</label>
                <select className="text-sm rounded-lg px-3 py-1.5" style={{ border: `1px solid ${C.line}`, minWidth: 180 }} value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
                  <option value="total">Total do período</option>
                  {dadosExibidos.map((d) => <option key={d.mes} value={d.mes}>{fmtPeriodo(d.mes)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {[
                ["Receita", fmtBRL(resumo.receita), C.green],
                ["Despesa (categorizada)", fmtBRL(resumo.despesa), C.amber],
                ["Margem líquida (R$)", fmtBRL(resumo.margem), resumo.margem >= 0 ? C.green : C.red],
                ["Margem líquida (%)", fmtPct(resumo.margemPct), resumo.margemPct >= 0 ? C.green : C.red],
              ].map(([label, v, color]) => (
                <div key={label} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
                  <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color }}>{v}</div>
                </div>
              ))}
            </div>
            {Math.abs(resumo.diferenca) > 0.01 && (
              <div className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: C.blueSoft, color: C.blue }}>
                Débitos do extrato não cobertos pelas despesas cadastradas no Financeiro: {fmtBRL(resumo.diferenca)} (conferência — detalhe em Caixa → Margem líquida).
              </div>
            )}

            <div className="mt-8">
              <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>Receita x despesa por categoria</div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={fmtPeriodo} fontSize={12} />
                  <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
                  <Tooltip formatter={(v) => fmtBRL(v)} labelFormatter={fmtPeriodo} />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
                  {categoriasUnicas.map((cat) => (
                    <Bar key={cat} dataKey={cat} name={cat} stackId="despesa" fill={corPorCategoria(cat)} stroke={C.card} strokeWidth={2} />
                  ))}
                  <Line type="monotone" dataKey="receita" name="Receita" stroke={C.green} strokeWidth={3} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-8">
              <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>
                Margem líquida {granularidade === "trimestral" ? "trimestral" : "mensal"} (%)
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dadosExibidos} margin={{ top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={fmtPeriodo} fontSize={12} />
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} fontSize={11} width={50} />
                  <Tooltip formatter={(v) => fmtPct(v)} labelFormatter={fmtPeriodo} />
                  <Line type="monotone" dataKey="margemPct" name="Margem líquida %" stroke={C.blue} strokeWidth={2.5} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-8">
              <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>
                Maiores ofensores {mesSel !== "total" && `— ${fmtPeriodo(mesSel)}`}
              </div>
              {rankingCategorias.length === 0 ? (
                <div className="text-sm py-6 text-center rounded-lg" style={{ color: C.inkSoft, background: C.card, border: `1px solid ${C.line}` }}>
                  Nenhuma despesa categorizada neste período. Cadastre fornecedores com "Categoria" preenchida no módulo Financeiro.
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                  {rankingCategorias.map((r, idx) => (
                    <div key={r.categoria} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ background: C.card, borderTop: idx ? `1px solid ${C.line}` : "none" }}>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: corPorCategoria(r.categoria) }} />
                      <span className="flex-1 font-semibold">{r.categoria}</span>
                      <span className="font-mono" style={{ color: C.inkSoft }}>{fmtBRL(r.valor)}</span>
                      <span className="font-mono font-bold w-14 text-right">{fmtPct(r.pct)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
