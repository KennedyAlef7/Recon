async function carregar(key, vazio) {
  const r = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, { credentials: "include" });
  if (!r.ok) return vazio;
  const { value } = await r.json();
  // Mescla com o formato vazio para preencher campos novos ausentes em dados salvos antes deles existirem
  return value ? { ...vazio, ...JSON.parse(value) } : vazio;
}

async function salvar(key, valor) {
  await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key, value: JSON.stringify(valor) }),
  });
}

const CAIXA_VAZIO = { transacoes: [], saldosConhecidos: [], rendimentosCaixinha: [], debitosIgnorados: [], arquivosImportados: [] };
const CLIENTES_VAZIO = { clientes: [], classificacoes: {}, ignoradas: [] };

export const carregarCaixa = () => carregar("caixa:v1", CAIXA_VAZIO);
export const salvarCaixa = (dados) => salvar("caixa:v1", dados);

export const carregarClientes = () => carregar("clientes:v1", CLIENTES_VAZIO);
export const salvarClientes = (dados) => salvar("clientes:v1", dados);

export const carregarFinanceiro = () => carregar("financeiro:v1", { fornecedores: [], ajustes: [] });
