import * as XLSX from "xlsx";
import Papa from "papaparse";

// ---------- Helpers (mesmo padrão usado em ConciliacaoFiscal.jsx) ----------

export const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const onlyDigits = (s) => (s || "").replace(/\D/g, "");

// "1.234,56" | "1234.56" | "-150,00" -> número
export const parseValor = (raw) => {
  if (typeof raw === "number") return raw;
  let s = String(raw || "").replace(/[R$\s]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export const parseDataBR = (raw) => {
  if (!raw) return "";
  const s = String(raw).trim();
  let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
};

const fileToText = (file, encoding = "ISO-8859-1") =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Falha ao ler arquivo"));
    r.readAsText(file, encoding);
  });

// Tenta UTF-8 primeiro; se produzir caracteres de substituição (U+FFFD) cai para ISO-8859-1
export async function fileToTextAuto(file) {
  const utf8 = await fileToText(file, "UTF-8");
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  return fileToText(file, "ISO-8859-1");
}

const excelSerialParaISO = (n) => {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
};

// hash determinístico (cyrb53) — usado para dedupar transações ao reimportar o mesmo arquivo
function hashId(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function transacaoId(conta, data, descricao, valor) {
  return hashId(`${conta}|${data}|${norm(descricao)}|${valor.toFixed(2)}`);
}

function novaTransacao({ conta, data, descricao, valorComSinal, arquivo }) {
  const valor = Math.abs(valorComSinal);
  if (!valor || !data) return null;
  return {
    id: transacaoId(conta, data, descricao, valorComSinal),
    conta,
    tipo: valorComSinal >= 0 ? "credito" : "debito",
    data,
    mes: data.slice(0, 7),
    descricao: descricao || "",
    valor,
    arquivo,
  };
}

const CONTAS_VALIDAS = ["itau", "nubank", "nubank_caixinha"];
function validarConta(conta) {
  if (!CONTAS_VALIDAS.includes(conta)) throw new Error(`Conta inválida: ${conta}`);
}

// ---------- OFX ----------
// Retorna { transacoes, saldos } — saldos vem do bloco <LEDGERBAL> quando presente
export function parseOFXExtrato(text, conta, fileName) {
  validarConta(conta);
  const transacoes = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const b of blocks) {
    const get = (tag) => {
      const m = b.match(new RegExp("<" + tag + ">([^<\\r\\n]*)", "i"));
      return m ? m[1].trim() : "";
    };
    const valorComSinal = parseValor(get("TRNAMT").replace(",", "."));
    const data = parseDataBR(get("DTPOSTED").slice(0, 8));
    const descricao = [get("NAME"), get("MEMO")].filter(Boolean).join(" - ");
    const t = novaTransacao({ conta, data, descricao, valorComSinal, arquivo: fileName });
    if (t) transacoes.push(t);
  }

  const saldos = [];
  const ledgerMatch = text.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/i);
  if (ledgerMatch) {
    const b = ledgerMatch[0];
    const get = (tag) => {
      const m = b.match(new RegExp("<" + tag + ">([^<\\r\\n]*)", "i"));
      return m ? m[1].trim() : "";
    };
    const saldo = parseValor(get("BALAMT").replace(",", "."));
    const data = parseDataBR(get("DTASOF").slice(0, 8));
    if (data) saldos.push({ conta, data, saldo, arquivo: fileName });
  }

  return { transacoes, saldos };
}

// detecta se um texto parece um UUID/identificador (não é valor monetário)
const pareceIdentificador = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(String(v).trim());

// valor monetário "de verdade": só dígitos, ponto, vírgula, sinal e R$
const ehValorMonetario = (v) => {
  const s = String(v).replace(/[R$\s]/g, "").trim();
  return /^-?[\d.,]+$/.test(s) && s.length > 0;
};

// ---------- CSV ----------
export async function parseCSVExtrato(text, conta, fileName) {
  validarConta(conta);
  const res = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = res.data;
  if (!rows.length) return { transacoes: [], saldos: [] };

  const nCols = Math.max(...rows.map((r) => r.length));

  // ---- 1) Tenta detectar colunas pelo CABEÇALHO (mais confiável) ----
  const headerCells = rows[0].map((c) => norm(String(c)));
  const temCabecalho = headerCells.some((c) => c === "DATA" || c.endsWith("DATA")) &&
    headerCells.some((c) => c.startsWith("VALOR") || c.includes("VALOR"));

  let dateCol = -1, valCol = -1, descCol = -1, saldoCol = -1;

  if (temCabecalho) {
    dateCol = headerCells.findIndex((c) => c === "DATA" || c.includes("DATA"));
    valCol = headerCells.findIndex((c) => c.startsWith("VALOR") || c === "VALOR (R$)" || c.includes("VALOR"));
    descCol = headerCells.findIndex((c) => c.includes("DESCRICAO") || c.includes("HISTORICO") || c.includes("LANCAMENTO") || c.includes("DETALHE") || c.includes("TITULO"));
    saldoCol = headerCells.findIndex((c) => c.includes("SALDO"));
    if (descCol < 0) {
      const idCol = headerCells.findIndex((c) => c.includes("IDENTIFICADOR") || c === "ID");
      descCol = [...Array(nCols).keys()]
        .filter((c) => c !== dateCol && c !== valCol && c !== idCol && c !== saldoCol)
        .sort((a, b) => rows.slice(1, 15).reduce((s, r) => s + String(r[b] || "").length, 0) - rows.slice(1, 15).reduce((s, r) => s + String(r[a] || "").length, 0))[0] ?? -1;
    }
  }

  // ---- 2) Sem cabeçalho útil: heurística por conteúdo (ignorando UUIDs) ----
  if (dateCol < 0 || valCol < 0) {
    const sample = rows.slice(0, Math.min(rows.length, 15));
    dateCol = -1; valCol = -1;
    for (let c = 0; c < nCols; c++) {
      const vals = sample.map((r) => r[c] || "");
      if (dateCol < 0 && vals.filter((v) => /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(v)).length >= sample.length / 2) dateCol = c;
    }
    for (let c = nCols - 1; c >= 0; c--) {
      if (c === dateCol) continue;
      const vals = sample.map((r) => r[c] || "");
      if (vals.some((v) => pareceIdentificador(v))) continue;
      const numeric = vals.filter((v) => ehValorMonetario(v) && parseValor(v) !== 0);
      if (numeric.length >= sample.length / 2) { valCol = c; break; }
    }
    if (descCol < 0) {
      descCol = [...Array(nCols).keys()]
        .filter((c) => c !== dateCol && c !== valCol)
        .filter((c) => !sample.some((r) => pareceIdentificador(r[c])))
        .sort((a, b) => sample.reduce((s, r) => s + String(r[b] || "").length, 0) - sample.reduce((s, r) => s + String(r[a] || "").length, 0))[0] ?? -1;
    }
  }

  if (dateCol < 0 || valCol < 0) return { transacoes: [], saldos: [] };

  // detecta se a primeira linha é cabeçalho (não tem data válida na coluna de data)
  const primeiraTemData = /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(String(rows[0][dateCol] || ""));
  const body = primeiraTemData ? rows : rows.slice(1);

  const transacoes = [];
  const saldos = [];
  for (const r of body) {
    const data = parseDataBR(r[dateCol]);
    const descricao = String(r[descCol] ?? "").trim();
    const valorComSinal = parseValor(r[valCol]);
    const t = novaTransacao({ conta, data, descricao, valorComSinal, arquivo: fileName });
    if (t) transacoes.push(t);
    if (saldoCol >= 0 && data) {
      const saldo = parseValor(r[saldoCol]);
      if (r[saldoCol] !== "" && r[saldoCol] != null) saldos.push({ conta, data, saldo, arquivo: fileName });
    }
  }
  return { transacoes, saldos };
}

// ---------- XLSX (ex: Itaú "Lançamentos") ----------
export async function parseXLSXExtrato(file, conta) {
  validarConta(conta);
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const transacoes = [];
  const saldos = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];

    // Corrige dimension incorreta (bug de alguns exportadores): recalcula o range
    if (ws["!ref"]) {
      const declaredRange = XLSX.utils.decode_range(ws["!ref"]);
      let maxRow = declaredRange.e.r;
      let maxCol = declaredRange.e.c;
      for (const key of Object.keys(ws)) {
        if (key.startsWith("!")) continue;
        const addr = XLSX.utils.decode_cell(key);
        if (addr.r > maxRow) maxRow = addr.r;
        if (addr.c > maxCol) maxCol = addr.c;
      }
      ws["!ref"] = XLSX.utils.encode_range({ s: declaredRange.s, e: { r: maxRow, c: maxCol } });
    }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) continue;

    // localiza a linha de cabeçalho da tabela
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cells = rows[i].map((c) => norm(String(c)));
      if (cells.some((c) => c === "DATA") && cells.some((c) => c.startsWith("VALOR"))) {
        headerIdx = i;
        break;
      }
    }

    let dateCol, descCol, razaoCol = -1, cnpjCol = -1, valCol, saldoCol = -1;
    if (headerIdx >= 0) {
      const header = rows[headerIdx].map((c) => norm(String(c)));
      dateCol = header.findIndex((c) => c === "DATA");
      descCol = header.findIndex((c) => c.includes("LANCAMENTO") || c.includes("HISTORICO") || c.includes("DESCRICAO"));
      razaoCol = header.findIndex((c) => c.includes("RAZAO") || c.includes("NOME"));
      cnpjCol = header.findIndex((c) => c.includes("CNPJ") || c.includes("CPF"));
      valCol = header.findIndex((c) => c.startsWith("VALOR"));
      saldoCol = header.findIndex((c) => c.includes("SALDO"));
    } else {
      // fallback genérico: detecta colunas por conteúdo
      const sample = rows.filter((r) => r.length > 1).slice(0, 15);
      const nCols = Math.max(...sample.map((r) => r.length));
      dateCol = -1; valCol = -1; descCol = -1;
      for (let c = 0; c < nCols; c++) {
        const vals = sample.map((r) => r[c]);
        const isDate = vals.filter((v) => /\d{2}\/\d{2}\/\d{4}/.test(String(v)) || (typeof v === "number" && v > 40000 && v < 60000)).length;
        if (dateCol < 0 && isDate >= sample.length / 2) dateCol = c;
      }
      for (let c = 0; c < nCols; c++) {
        if (c === dateCol) continue;
        const vals = sample.map((r) => r[c]);
        if (vals.filter((v) => typeof v === "number" || /-?[\d.,]+$/.test(String(v).trim())).length >= sample.length / 2) valCol = c;
      }
      descCol = [...Array(nCols).keys()].filter((c) => c !== dateCol && c !== valCol)
        .sort((a, b) => sample.reduce((s, r) => s + String(r[b] || "").length, 0) - sample.reduce((s, r) => s + String(r[a] || "").length, 0))[0];
      if (dateCol < 0 || valCol < 0) continue;
    }

    for (const r of rows.slice(headerIdx + 1)) {
      const descBase = String(r[descCol] ?? "").trim();
      const descN = norm(descBase);
      if (!descBase || descN.includes("SALDO")) continue;
      const rawVal = r[valCol];
      const valorComSinal = typeof rawVal === "number" ? rawVal : parseValor(rawVal);
      if (!valorComSinal) continue;
      const rawData = r[dateCol];
      const data = typeof rawData === "number" ? excelSerialParaISO(rawData) : parseDataBR(rawData);
      const razao = razaoCol >= 0 ? String(r[razaoCol] ?? "").trim() : "";
      const cnpj = cnpjCol >= 0 ? String(r[cnpjCol] ?? "").trim() : "";
      const descricao = [descBase, razao, cnpj].filter(Boolean).join(" · ");
      const t = novaTransacao({ conta, data, descricao, valorComSinal, arquivo: file.name });
      if (t) transacoes.push(t);
      if (saldoCol >= 0 && data) {
        const rawSaldo = r[saldoCol];
        const saldo = typeof rawSaldo === "number" ? rawSaldo : parseValor(rawSaldo);
        if (rawSaldo !== "" && rawSaldo != null) saldos.push({ conta, data, saldo, arquivo: file.name });
      }
    }
  }
  return { transacoes, saldos };
}

// ---------- Entrada única: escolhe o parser pela extensão ----------
export async function parseExtrato(file, conta) {
  validarConta(conta);
  if (/\.ofx$/i.test(file.name)) {
    return parseOFXExtrato(await fileToTextAuto(file), conta, file.name);
  }
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    return parseXLSXExtrato(file, conta);
  }
  if (/\.(csv|txt)$/i.test(file.name)) {
    return parseCSVExtrato(await fileToTextAuto(file), conta, file.name);
  }
  throw new Error("Formato não suportado (use OFX, CSV, XLS ou XLSX)");
}

export const CONTAS = [
  { key: "itau", label: "Itaú" },
  { key: "nubank", label: "Nubank (conta)" },
  { key: "nubank_caixinha", label: "Nubank2 (caixinha)" },
];
