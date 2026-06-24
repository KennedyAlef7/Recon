/**
 * POST /api/sheets
 * Escreve dados de fornecedores e provisão em uma Google Spreadsheet compartilhada.
 *
 * Variáveis de ambiente necessárias no Vercel:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — e-mail da service account (ex: bot@projeto.iam.gserviceaccount.com)
 *   GOOGLE_PRIVATE_KEY            — chave privada PEM (cole o valor completo, incluindo cabeçalho/rodapé)
 *   GOOGLE_SPREADSHEET_ID         — ID da planilha (parte da URL: /spreadsheets/d/<ID>/edit)
 */

import { createSign } from "crypto";
import { estaAutenticado } from "./_auth.js";

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// ---------- JWT / OAuth ----------
async function getAccessToken(email, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  const unsigned = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(privateKeyPem, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OAuth falhou: ${err}`);
  }
  const { access_token } = await r.json();
  return access_token;
}

// ---------- Sheets helpers ----------
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsRequest(token, method, path, body) {
  const r = await fetch(`${SHEETS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Sheets API ${r.status}: ${err}`);
  }
  return r.status === 204 ? null : r.json();
}

// Garante que as abas existam; cria as que faltam e limpa as existentes
async function garantirAbas(token, spreadsheetId, nomesAbas) {
  const info = await sheetsRequest(token, "GET", `/${spreadsheetId}?fields=sheets.properties`);
  const existentes = (info.sheets || []).map((s) => ({ title: s.properties.title, id: s.properties.sheetId }));

  const requests = [];

  // Cria abas que não existem
  for (const nome of nomesAbas) {
    if (!existentes.find((e) => e.title === nome)) {
      requests.push({ addSheet: { properties: { title: nome } } });
    }
  }

  if (requests.length) {
    await sheetsRequest(token, "POST", `/${spreadsheetId}:batchUpdate`, { requests });
    // Re-busca após criação
    const info2 = await sheetsRequest(token, "GET", `/${spreadsheetId}?fields=sheets.properties`);
    return (info2.sheets || []).map((s) => ({ title: s.properties.title, id: s.properties.sheetId }));
  }

  return existentes;
}

async function clearAndWrite(token, spreadsheetId, nomeAba, rows) {
  // Limpa a aba
  await sheetsRequest(token, "POST", `/${spreadsheetId}/values/${encodeURIComponent(nomeAba)}:clear`, {});
  // Escreve os dados
  if (!rows.length) return;
  await sheetsRequest(token, "PUT",
    `/${spreadsheetId}/values/${encodeURIComponent(nomeAba)}?valueInputOption=USER_ENTERED`,
    { range: nomeAba, majorDimension: "ROWS", values: rows }
  );
}

function fmtBRL(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function fmtMes(ym) {
  if (!ym) return "";
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [y, m] = ym.split("-");
  return `${meses[parseInt(m, 10) - 1]}/${y}`;
}

// ---------- Handler principal ----------
export default async function handler(req, res) {
  if (!estaAutenticado(req)) return res.status(401).json({ error: "Sessão expirada." });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!email || !rawKey || !spreadsheetId) {
    return res.status(503).json({
      error: "Google Sheets não configurado. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY e GOOGLE_SPREADSHEET_ID no Vercel.",
    });
  }

  // A chave vem como string com \n literais no env — converter para quebras reais
  const privateKey = rawKey.replace(/\\n/g, "\n");

  try {
    const { mes, fornecedores = [], ajustes = [], provisao = [] } = req.body ?? {};
    const token = await getAccessToken(email, privateKey);

    const nomeAbaProvisao = `Provisão ${fmtMes(mes)}`;
    await garantirAbas(token, spreadsheetId, ["Fornecedores", nomeAbaProvisao, "Ajustes"]);

    // ---- Aba Fornecedores ----
    const headerForn = ["Nome / Razão social", "CNPJ / CPF", "Chave Pix", "Categoria", "Valor Bruto (R$)", "Descontos Fixos (R$)", "Valor Líquido (R$)"];
    const rowsForn = fornecedores.map((f) => {
      const totalDesc = (f.descontos || []).reduce((s, d) => s + d.valor, 0);
      const liquido = Math.max(0, f.valorBruto - totalDesc);
      return [f.nome, f.cnpj || "", f.chavePix || "", f.categoria || "", fmtBRL(f.valorBruto), fmtBRL(totalDesc), fmtBRL(liquido)];
    });
    // Linha de totais
    const totalBruto = fornecedores.reduce((s, f) => s + f.valorBruto, 0);
    const totalDesc = fornecedores.reduce((s, f) => s + (f.descontos || []).reduce((ss, d) => ss + d.valor, 0), 0);
    const totalLiq = fornecedores.reduce((s, f) => s + Math.max(0, f.valorBruto - (f.descontos || []).reduce((ss, d) => ss + d.valor, 0)), 0);
    rowsForn.push(["TOTAL", "", "", "", fmtBRL(totalBruto), fmtBRL(totalDesc), fmtBRL(totalLiq)]);
    await clearAndWrite(token, spreadsheetId, "Fornecedores", [headerForn, ...rowsForn]);

    // ---- Aba Provisão do mês ----
    const headerProv = ["Fornecedor", "CNPJ", "Chave Pix", "Valor Bruto", "Desc. Fixos", "Ajustes do Mês", "Provisão Líquida"];
    const rowsProv = provisao.map((p) => {
      const ajusteNet = p.totalAbonos - p.totalDescPontuais;
      return [
        p.nome, p.cnpj || "", p.chavePix || "",
        fmtBRL(p.valorBruto), fmtBRL(p.totalDescontos),
        ajusteNet !== 0 ? fmtBRL(ajusteNet) : "",
        fmtBRL(p.provisao),
      ];
    });
    const totalProvisao = provisao.reduce((s, p) => s + p.provisao, 0);
    rowsProv.push(["TOTAL", "", "", "", "", "", fmtBRL(totalProvisao)]);
    await clearAndWrite(token, spreadsheetId, nomeAbaProvisao, [headerProv, ...rowsProv]);

    // ---- Aba Ajustes ----
    const headerAdj = ["Mês", "Fornecedor", "Tipo", "Descrição", "Valor (R$)"];
    const fornMap = Object.fromEntries(fornecedores.map((f) => [f.id, f.nome]));
    const rowsAdj = ajustes
      .slice()
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .map((a) => [
        fmtMes(a.mes),
        fornMap[a.fornecedorId] || "(removido)",
        a.tipo === "abono" ? "Abono / Acréscimo" : "Desconto pontual",
        a.descricao,
        fmtBRL(a.valor),
      ]);
    await clearAndWrite(token, spreadsheetId, "Ajustes", rowsAdj.length ? [headerAdj, ...rowsAdj] : [headerAdj]);

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return res.json({ ok: true, url });
  } catch (e) {
    console.error("sheets error", e);
    return res.status(500).json({ error: e.message });
  }
}
