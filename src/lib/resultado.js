export const SEM_CATEGORIA = "Sem categoria";

export const categoriaNormalizada = (cat) => (cat || "").trim() || SEM_CATEGORIA;

function provisaoPorFornecedor(fornecedor, mes, ajustes) {
  const totalDescontos = fornecedor.descontos.reduce((s, d) => s + d.valor, 0);
  const ajustesMes = ajustes.filter((a) => a.fornecedorId === fornecedor.id && a.mes === mes);
  const totalDescPontuais = ajustesMes.filter((a) => a.tipo === "desconto").reduce((s, a) => s + a.valor, 0);
  const totalAbonos = ajustesMes.filter((a) => a.tipo === "abono").reduce((s, a) => s + a.valor, 0);
  return Math.max(0, fornecedor.valorBruto - totalDescontos - totalDescPontuais + totalAbonos);
}

// Receita e despesa mensal consolidadas (mesma convenção usada em todo o app):
// receita = créditos de contas operacionais (exclui caixinha) que não foram marcados "Ignorar" na classificação por cliente;
// despesa principal = provisão líquida dos fornecedores cadastrados no Financeiro (por categoria);
// débitos do extrato entram só como conferência/diferença, não como despesa principal.
export function calcularResultadoMensal(caixaData, financeiroData, ignoradas) {
  const receitaPorMes = {};
  const despesaExtratoPorMes = {};
  caixaData.transacoes.forEach((t) => {
    if (t.conta === "nubank_caixinha") return;
    if (ignoradas.has(t.id)) return;
    if (t.tipo === "credito") receitaPorMes[t.mes] = (receitaPorMes[t.mes] || 0) + t.valor;
    else despesaExtratoPorMes[t.mes] = (despesaExtratoPorMes[t.mes] || 0) + t.valor;
  });

  const meses = [...new Set([...Object.keys(receitaPorMes), ...Object.keys(despesaExtratoPorMes)])].sort();

  return meses.map((mes) => {
    const receita = receitaPorMes[mes] || 0;
    const despesaExtrato = despesaExtratoPorMes[mes] || 0;

    const porCategoria = {};
    financeiroData.fornecedores.forEach((f) => {
      const valor = provisaoPorFornecedor(f, mes, financeiroData.ajustes);
      if (!valor) return;
      const cat = categoriaNormalizada(f.categoria);
      porCategoria[cat] = (porCategoria[cat] || 0) + valor;
    });
    const despesaFinanceiro = Object.values(porCategoria).reduce((s, v) => s + v, 0);

    const margem = receita - despesaFinanceiro;
    const margemPct = receita > 0 ? (margem / receita) * 100 : 0;

    return {
      mes, receita, despesaFinanceiro, despesaExtrato, porCategoria,
      margem, margemPct, diferenca: despesaExtrato - despesaFinanceiro,
    };
  });
}
