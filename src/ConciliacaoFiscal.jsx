import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

// ---------- Paleta ----------
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

const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const onlyDigits = (s) => (s || "").replace(/\D/g, "");

// "1.234,56" | "1234.56" | "-150,00" -> número
const parseValor = (raw) => {
  if (typeof raw === "number") return raw;
  let s = String(raw || "").replace(/[R$\s]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const parseDataBR = (raw) => {
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

const fmtData = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  });

const fileToText = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Falha ao ler arquivo"));
    r.readAsText(file, "ISO-8859-1");
  });

// ---------- Claude API (via proxy serverless) ----------
// A chave da Anthropic NUNCA fica no frontend. Esta função chama /api/claude,
// uma Serverless Function (Vercel) que injeta a ANTHROPIC_API_KEY no servidor.
async function callClaude(content, maxTokens = 1500) {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (response.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!response.ok) {
    let msg = `Erro ${response.status} ao chamar a API`;
    try { const e = await response.json(); if (e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  const data = await response.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text;
}

function parseJSONLoose(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = Math.min(
    ...[clean.indexOf("["), clean.indexOf("{")].filter((i) => i >= 0)
  );
  if (!isFinite(start)) throw new Error("Resposta sem JSON");
  // tenta achar o fechamento correspondente do fim para o início
  for (let end = clean.length; end > start; end--) {
    try {
      return JSON.parse(clean.slice(start, end));
    } catch (e) {
      /* continua */
    }
  }
  throw new Error("JSON inválido na resposta");
}

async function extrairNotaPDF(file) {
  const b64 = await fileToBase64(file);
  const text = await callClaude(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      {
        type: "text",
        text:
          'Este PDF contém uma ou mais notas fiscais (NFe/NFSe/DANFE) emitidas contra uma empresa. Extraia os dados e responda SOMENTE com um array JSON compacto, sem markdown e sem texto extra, no formato: [{"fornecedor":"razão social do emitente/prestador","cnpj":"apenas dígitos do CNPJ do emitente","numero":"número da nota","data_emissao":"DD/MM/AAAA","valor":1234.56}]. O valor deve ser o valor total da nota como número com ponto decimal.',
      },
    ],
    1500
  );
  const arr = parseJSONLoose(text);
  return (Array.isArray(arr) ? arr : [arr]).map((n) => ({
    id: uid(),
    fornecedor: n.fornecedor || "Fornecedor não identificado",
    cnpj: onlyDigits(n.cnpj),
    numero: String(n.numero || "—"),
    dataEmissao: parseDataBR(n.data_emissao),
    valor: parseValor(n.valor),
    arquivo: file.name,
  }));
}

async function extrairExtratoPDF(file) {
  const b64 = await fileToBase64(file);
  const text = await callClaude(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      {
        type: "text",
        text:
          'Este PDF é um extrato bancário. Extraia APENAS as transações de SAÍDA (débitos, pagamentos, PIX enviados, TED/DOC enviados, boletos pagos). Ignore créditos/entradas, saldos e tarifas de rendimento. Responda SOMENTE com um array JSON compacto, sem markdown: [{"data":"DD/MM/AAAA","descricao":"texto da transação incluindo nome do favorecido se houver","valor":1234.56}]. Valor sempre positivo, número com ponto decimal.',
      },
    ],
    4000
  );
  const arr = parseJSONLoose(text);
  return (Array.isArray(arr) ? arr : []).map((t) => ({
    id: uid(),
    data: parseDataBR(t.data),
    descricao: t.descricao || "",
    valor: Math.abs(parseValor(t.valor)),
    arquivo: file.name,
  }));
}

function parseOFX(text, fileName) {
  const out = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const b of blocks) {
    const get = (tag) => {
      const m = b.match(new RegExp("<" + tag + ">([^<\\r\\n]*)", "i"));
      return m ? m[1].trim() : "";
    };
    const amt = parseValor(get("TRNAMT").replace(",", "."));
    if (amt >= 0) continue; // só saídas
    out.push({
      id: uid(),
      data: parseDataBR(get("DTPOSTED").slice(0, 8)),
      descricao: [get("NAME"), get("MEMO")].filter(Boolean).join(" - "),
      valor: Math.abs(amt),
      arquivo: fileName,
    });
  }
  return out;
}

async function parseCSVExtrato(text, fileName) {
  const res = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = res.data;
  if (!rows.length) return [];
  // heurística de colunas
  const sample = rows.slice(0, Math.min(rows.length, 15));
  const nCols = Math.max(...sample.map((r) => r.length));
  let dateCol = -1, valCol = -1;
  for (let c = 0; c < nCols; c++) {
    const vals = sample.map((r) => r[c] || "");
    if (dateCol < 0 && vals.filter((v) => /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(v)).length >= sample.length / 2) dateCol = c;
  }
  for (let c = nCols - 1; c >= 0; c--) {
    if (c === dateCol) continue;
    const vals = sample.map((r) => r[c] || "");
    const numeric = vals.filter((v) => /-?[\d.,]+$/.test(String(v).replace(/[R$\s]/g, "")) && parseValor(v) !== 0);
    if (numeric.length >= sample.length / 2) { valCol = c; break; }
  }
  if (dateCol < 0 || valCol < 0) {
    // fallback: pede ao Claude o mapeamento das colunas
    const head = rows.slice(0, 5).map((r) => r.join(" | ")).join("\n");
    const t = await callClaude(
      [{ type: "text", text: `Estas são as primeiras linhas de um CSV de extrato bancário (colunas separadas por "|"):\n${head}\n\nResponda SOMENTE com JSON: {"data":indice,"descricao":indice,"valor":indice,"tem_cabecalho":true/false} usando índices de coluna começando em 0.` }],
      1000
    );
    const map = parseJSONLoose(t);
    dateCol = map.data; valCol = map.valor;
    const descCol = map.descricao;
    const body = map.tem_cabecalho ? rows.slice(1) : rows;
    return body
      .map((r) => ({ id: uid(), data: parseDataBR(r[dateCol]), descricao: r[descCol] || "", valor: parseValor(r[valCol]), arquivo: fileName }))
      .filter((t2) => t2.valor < 0)
      .map((t2) => ({ ...t2, valor: Math.abs(t2.valor) }));
  }
  const descCol = [...Array(nCols).keys()]
    .filter((c) => c !== dateCol && c !== valCol)
    .sort((a, b) => {
      const len = (c) => sample.reduce((s, r) => s + String(r[c] || "").length, 0);
      return len(b) - len(a);
    })[0];
  const startRow = /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(rows[0][dateCol] || "") ? 0 : 1;
  return rows
    .slice(startRow)
    .map((r) => ({ id: uid(), data: parseDataBR(r[dateCol]), descricao: r[descCol] || "", valor: parseValor(r[valCol]), arquivo: fileName }))
    .filter((t) => t.valor < 0)
    .map((t) => ({ ...t, valor: Math.abs(t.valor) }));
}

const excelSerialParaISO = (n) => {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
};

async function parseXLSXExtrato(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    if (!rows.length) continue;

    // localiza a linha de cabeçalho da tabela
    let headerIdx = -1;
    let layout = "extrato"; // extrato (Lançamentos) | sispag (Consulta de Pagamentos)
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cells = rows[i].map((c) => norm(String(c)));
      if (cells.some((c) => c.includes("FAVORECIDO") || c.includes("BENEFICIARIO")) && cells.some((c) => c.startsWith("VALOR"))) {
        headerIdx = i;
        layout = "sispag";
        break;
      }
      if (cells.some((c) => c === "DATA") && cells.some((c) => c.startsWith("VALOR"))) {
        headerIdx = i;
        break;
      }
    }

    // ---- Layout SISPAG (Consulta de Pagamentos): valores positivos = saídas ----
    if (layout === "sispag") {
      const header = rows[headerIdx].map((c) => norm(String(c)));
      const favCol = header.findIndex((c) => c.includes("FAVORECIDO") || c.includes("BENEFICIARIO"));
      const cnpjCol2 = header.findIndex((c) => c.includes("CNPJ") || c.includes("CPF"));
      const tipoCol = header.findIndex((c) => c.includes("TIPO"));
      const dataCol2 = header.findIndex((c) => c.includes("DATA"));
      const valCol2 = header.findIndex((c) => c.startsWith("VALOR"));
      const statusCol = header.findIndex((c) => c.includes("STATUS"));
      for (const r of rows.slice(headerIdx + 1)) {
        const fav = String(r[favCol] ?? "").trim();
        if (!fav || norm(fav).startsWith("TOTAL")) continue;
        const status = statusCol >= 0 ? norm(String(r[statusCol] ?? "")) : "";
        if (status && !status.includes("EFETUADO")) continue; // pula agendados/cancelados/rejeitados
        const rawVal = r[valCol2];
        const valor = typeof rawVal === "number" ? rawVal : parseValor(rawVal);
        if (!valor) continue;
        const rawData = r[dataCol2];
        const data = typeof rawData === "number" ? excelSerialParaISO(rawData) : parseDataBR(rawData);
        const tipo = tipoCol >= 0 ? String(r[tipoCol] ?? "").trim() : "";
        const doc = cnpjCol2 >= 0 ? String(r[cnpjCol2] ?? "").trim() : "";
        out.push({
          id: uid(),
          data,
          descricao: [tipo, fav, doc].filter(Boolean).join(" · "),
          valor: Math.abs(valor),
          arquivo: file.name,
        });
      }
      continue; // próxima planilha
    }

    let dateCol, descCol, razaoCol = -1, cnpjCol = -1, valCol;
    if (headerIdx >= 0) {
      const header = rows[headerIdx].map((c) => norm(String(c)));
      dateCol = header.findIndex((c) => c === "DATA");
      descCol = header.findIndex((c) => c.includes("LANCAMENTO") || c.includes("HISTORICO") || c.includes("DESCRICAO"));
      razaoCol = header.findIndex((c) => c.includes("RAZAO") || c.includes("NOME"));
      cnpjCol = header.findIndex((c) => c.includes("CNPJ") || c.includes("CPF"));
      valCol = header.findIndex((c) => c.startsWith("VALOR"));
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
      // pula linhas de saldo e linhas vazias
      if (!descBase || descN.includes("SALDO")) continue;
      const rawVal = r[valCol];
      const valor = typeof rawVal === "number" ? rawVal : parseValor(rawVal);
      if (!valor || valor >= 0) continue; // só saídas (débitos)
      const rawData = r[dateCol];
      const data = typeof rawData === "number" ? excelSerialParaISO(rawData) : parseDataBR(rawData);
      const razao = razaoCol >= 0 ? String(r[razaoCol] ?? "").trim() : "";
      const cnpj = cnpjCol >= 0 ? String(r[cnpjCol] ?? "").trim() : "";
      out.push({
        id: uid(),
        data,
        descricao: [descBase, razao, cnpj].filter(Boolean).join(" · "),
        valor: Math.abs(valor),
        arquivo: file.name,
      });
    }
  }
  return out;
}

// ---------- Sugestões de conciliação ----------
function sugerir(payment, invoices, links) {
  const pagoPorNota = {};
  links.forEach((l) => (pagoPorNota[l.invoiceId] = (pagoPorNota[l.invoiceId] || 0) + l.valor));
  const descN = norm(payment.descricao);
  const descD = onlyDigits(payment.descricao);
  const scored = invoices
    .map((inv) => {
      const restante = inv.valor - (pagoPorNota[inv.id] || 0);
      if (restante <= 0.005) return null;
      let score = 0;
      const reasons = [];
      const diff = Math.abs(payment.valor - restante);
      if (diff < 0.01) { score += 50; reasons.push("valor exato"); }
      else if (diff / Math.max(restante, 1) < 0.01) { score += 40; reasons.push("valor ≈"); }
      else if (payment.valor < restante) { score += 8; reasons.push("pagamento parcial possível"); }
      const tokens = norm(inv.fornecedor).split(" ").filter((t) => t.length > 3 && !["LTDA", "EIRELI", "COMERCIO", "SERVICOS"].includes(t));
      const hits = tokens.filter((t) => descN.includes(t)).length;
      if (tokens.length && hits) { score += Math.min(35, (hits / tokens.length) * 35); reasons.push("nome no extrato"); }
      if (inv.cnpj && inv.cnpj.length >= 8 && descD.includes(inv.cnpj.slice(0, 8))) { score += 40; reasons.push("CNPJ no extrato"); }
      if (payment.data && inv.dataEmissao) {
        const dd = (new Date(payment.data) - new Date(inv.dataEmissao)) / 86400000;
        if (dd >= -2 && dd <= 90) { score += 10; reasons.push("data compatível"); }
      }
      return { inv, score, restante, reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).filter((s) => s.score >= 8);
}

// ---------- Componentes ----------
const Chip = ({ tone, children }) => {
  const map = {
    green: [C.greenSoft, C.green],
    amber: [C.amberSoft, C.amber],
    red: [C.redSoft, C.red],
    blue: [C.blueSoft, C.blue],
    gray: ["#EEF1F0", C.inkSoft],
  };
  const [bg, fg] = map[tone] || map.gray;
  return (
    <span style={{ background: bg, color: fg }} className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">
      {children}
    </span>
  );
};

const Th = ({ children, right }) => (
  <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${right ? "text-right" : "text-left"}`} style={{ color: C.inkSoft }}>
    {children}
  </th>
);
const Td = ({ children, right, mono }) => (
  <td className={`px-3 py-2 text-sm ${right ? "text-right" : ""} ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: C.ink }}>
    {children}
  </td>
);

async function entregarArquivo(filename, content, mime, setSaida) {
  // Estratégia 1: download via Blob + createObjectURL
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  } catch (e) { /* segue para fallback */ }
  // Estratégia 2: nova janela com o conteúdo + cópia
  if (setSaida) setSaida({ filename, content });
}

function exportCSV(filename, headers, rows, setSaida) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  entregarArquivo(filename, csv, "text/csv;charset=utf-8", setSaida);
}

export default function ConciliacaoFiscal({ onLogout }) {
  const [tab, setTab] = useState("notas");
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [links, setLinks] = useState([]); // {id, paymentId, invoiceId, valor}
  const [progress, setProgress] = useState(null); // {done,total,label}
  const [errors, setErrors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [manualSel, setManualSel] = useState({}); // paymentId -> invoiceId
  const [semNF, setSemNF] = useState({}); // paymentId -> { motivo: string }
  const [semNFInput, setSemNFInput] = useState({}); // paymentId -> texto digitado
  const [saida, setSaida] = useState(null); // { filename, content } fallback de exportação
  const [copiado, setCopiado] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimer = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (confirmClear) {
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 5000);
      return () => clearTimeout(confirmTimer.current);
    }
  }, [confirmClear]);

  // ---- persistência ----
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("conciliacao:v1");
        if (r && r.value) {
          const d = JSON.parse(r.value);
          setInvoices(d.invoices || []);
          setPayments(d.payments || []);
          setLinks(d.links || []);
          setSemNF(d.semNF || {});
        }
      } catch (e) {
        /* primeira execução: sem dados salvos */
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set("conciliacao:v1", JSON.stringify({ invoices, payments, links, semNF }));
      } catch (e) {
        console.error("Falha ao salvar", e);
      }
    }, 600);
  }, [invoices, payments, links, semNF, loaded]);

  const pagoPorNota = useMemo(() => {
    const m = {};
    links.forEach((l) => (m[l.invoiceId] = (m[l.invoiceId] || 0) + l.valor));
    return m;
  }, [links]);

  const linksPorPagamento = useMemo(() => {
    const m = {};
    links.forEach((l) => (m[l.paymentId] = (m[l.paymentId] || []).concat(l)));
    return m;
  }, [links]);

  // ---- uploads ----
  async function handleNotas(files) {
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length, label: "Lendo notas fiscais" });
    const errs = [];
    const arquivosJaImportados = new Set(invoices.map((i) => i.arquivo));
    const chavesExistentes = new Set(invoices.map((i) => `${i.cnpj}|${i.numero}|${i.valor.toFixed(2)}`));
    for (let i = 0; i < list.length; i++) {
      try {
        if (!/\.pdf$/i.test(list[i].name)) throw new Error("Apenas PDF para notas");
        if (arquivosJaImportados.has(list[i].name)) {
          errs.push(`${list[i].name}: arquivo já importado anteriormente — ignorado`);
        } else {
          const extraidas = await extrairNotaPDF(list[i]);
          const novas = [];
          for (const n of extraidas) {
            const chave = `${n.cnpj}|${n.numero}|${n.valor.toFixed(2)}`;
            if (chavesExistentes.has(chave)) {
              errs.push(`${list[i].name}: NF ${n.numero} de ${n.fornecedor} já cadastrada — ignorada`);
            } else {
              chavesExistentes.add(chave);
              novas.push(n);
            }
          }
          if (novas.length) setInvoices((prev) => [...prev, ...novas]);
          arquivosJaImportados.add(list[i].name);
        }
      } catch (e) {
        errs.push(`${list[i].name}: ${e.message}`);
      }
      setProgress({ done: i + 1, total: list.length, label: "Lendo notas fiscais" });
    }
    setErrors(errs);
    setProgress(null);
  }

  async function handleExtratos(files) {
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length, label: "Lendo extratos" });
    const errs = [];
    const arquivosJaImportados = new Set(payments.map((p) => p.arquivo));
    const chavesExistentes = new Set(payments.map((p) => `${p.data}|${p.valor.toFixed(2)}|${norm(p.descricao)}`));
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      try {
        if (arquivosJaImportados.has(f.name)) {
          errs.push(`${f.name}: arquivo já importado anteriormente — ignorado`);
        } else {
          let extraidos = [];
          if (/\.ofx$/i.test(f.name)) extraidos = parseOFX(await fileToText(f), f.name);
          else if (/\.(xlsx|xls)$/i.test(f.name)) extraidos = await parseXLSXExtrato(f);
          else if (/\.(csv|txt)$/i.test(f.name)) extraidos = await parseCSVExtrato(await fileToText(f), f.name);
          else if (/\.pdf$/i.test(f.name)) extraidos = await extrairExtratoPDF(f);
          else throw new Error("Formato não suportado (use OFX, XLS/XLSX, CSV ou PDF)");
          const novos = [];
          let duplicados = 0;
          for (const t of extraidos) {
            const chave = `${t.data}|${t.valor.toFixed(2)}|${norm(t.descricao)}`;
            if (chavesExistentes.has(chave)) duplicados++;
            else { chavesExistentes.add(chave); novos.push(t); }
          }
          if (duplicados) errs.push(`${f.name}: ${duplicados} lançamento(s) duplicado(s) ignorado(s)`);
          if (!extraidos.length) errs.push(`${f.name}: nenhuma saída encontrada`);
          if (novos.length) setPayments((prev) => [...prev, ...novos]);
          arquivosJaImportados.add(f.name);
        }
      } catch (e) {
        errs.push(`${f.name}: ${e.message}`);
      }
      setProgress({ done: i + 1, total: list.length, label: "Lendo extratos" });
    }
    setErrors(errs);
    setProgress(null);
  }

  // ---- conciliação ----
  function vincular(payment, invoice) {
    // lê links diretamente do setter para garantir valor atualizado
    setLinks((prev) => {
      const jaPago = prev.filter((l) => l.invoiceId === invoice.id).reduce((s, l) => s + l.valor, 0);
      const jaAlocado = prev.filter((l) => l.paymentId === payment.id).reduce((s, l) => s + l.valor, 0);
      const valor = Math.min(payment.valor - jaAlocado, invoice.valor - jaPago);
      if (valor <= 0.005) return prev;
      return [...prev, { id: uid(), paymentId: payment.id, invoiceId: invoice.id, valor }];
    });
  }
  const desvincular = (linkId) => setLinks((prev) => prev.filter((l) => l.id !== linkId));

  // ---- export / import estado completo ----
  function exportarEstado() {
    const estado = { versao: 2, exportadoEm: new Date().toISOString(), invoices, payments, links, semNF };
    const json = JSON.stringify(estado, null, 2);
    entregarArquivo(`conciliacao_${new Date().toISOString().slice(0, 10)}.json`, json, "application/json;charset=utf-8", setSaida);
  }

  function importarEstado(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        if (!text || !text.trim().startsWith("{")) throw new Error("Arquivo não parece ser um JSON válido");
        const d = JSON.parse(text);
        if (!Array.isArray(d.invoices) || !Array.isArray(d.payments))
          throw new Error("Estrutura inválida — use apenas arquivos exportados por este app");
        setInvoices(d.invoices);
        setPayments(d.payments);
        setLinks(Array.isArray(d.links) ? d.links : []);
        setSemNF(d.semNF && typeof d.semNF === "object" ? d.semNF : {});
        setManualSel({});
        setSemNFInput({});
        setErrors([`✓ Estado restaurado com sucesso: ${d.invoices.length} nota(s), ${d.payments.length} pagamento(s), ${(d.links||[]).length} vínculo(s)${d.exportadoEm ? ` — exportado em ${new Date(d.exportadoEm).toLocaleString("pt-BR")}` : ""}.`]);
        setTab("notas");
      } catch (err) {
        setErrors([`Erro ao importar estado: ${err.message}`]);
      }
    };
    reader.onerror = () => setErrors(["Falha ao ler o arquivo. Tente novamente."]);
    reader.readAsText(file, "UTF-8");
  }

  async function limparTudo() {
    setInvoices([]); setPayments([]); setLinks([]);
    setManualSel({}); setSemNF({}); setSemNFInput({}); setErrors([]); setConfirmClear(false);
    try { await window.storage.delete("conciliacao:v1"); } catch (e) { /* chave pode não existir */ }
  }

  // ---- relatórios ----
  const relatorioA = useMemo(
    () =>
      invoices.map((inv) => {
        const pago = pagoPorNota[inv.id] || 0;
        const pendente = Math.max(0, inv.valor - pago);
        const status = pago <= 0.005 ? "Em aberto" : pendente <= 0.005 ? "Paga" : "Parcial";
        return { inv, pago, pendente, status };
      }),
    [invoices, pagoPorNota]
  );

  const relatorioB = useMemo(
    () =>
      payments.map((p) => {
        const ls = linksPorPagamento[p.id] || [];
        const flagSemNF = !!semNF[p.id];
        const fornecedores = [...new Set(ls.map((l) => invoices.find((i) => i.id === l.invoiceId)?.fornecedor).filter(Boolean))];
        return { p, temNota: ls.length > 0, flagSemNF, motivo: semNF[p.id]?.motivo || "", fornecedor: fornecedores.join(" / ") };
      }),
    [payments, linksPorPagamento, invoices, semNF]
  );

  const totais = useMemo(() => {
    const tNotas = invoices.reduce((s, i) => s + i.valor, 0);
    const tPagos = payments.reduce((s, p) => s + p.valor, 0);
    const tSemNota = relatorioB.filter((r) => !r.temNota && !r.flagSemNF).reduce((s, r) => s + r.p.valor, 0);
    const tSemNFFlag = relatorioB.filter((r) => r.flagSemNF).reduce((s, r) => s + r.p.valor, 0);
    const tPendente = relatorioA.reduce((s, r) => s + r.pendente, 0);
    return { tNotas, tPagos, tSemNota, tPendente, tSemNFFlag };
  }, [invoices, payments, relatorioA, relatorioB]);

  const pendentesConciliar = payments.filter((p) => {
    if (semNF[p.id]) return false;
    const alocado = (linksPorPagamento[p.id] || []).reduce((s, l) => s + l.valor, 0);
    return p.valor - alocado > 0.005;
  });

  const tabs = [
    ["notas", `Notas fiscais (${invoices.length})`],
    ["extratos", `Extratos (${payments.length})`],
    ["conciliar", `Conciliar (${pendentesConciliar.length})`],
    ["semNF", `Sem NF (${Object.keys(semNF).length})`],
    ["relatorios", "Relatórios"],
  ];

  const UploadBox = ({ accept, onFiles, title, hint }) => (
    <label
      className="block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
      style={{ borderColor: C.line, background: C.card }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
    >
      <div className="text-base font-semibold" style={{ color: C.ink }}>{title}</div>
      <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{hint}</div>
      <div className="mt-3 inline-block px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: C.green }}>
        Escolher arquivos
      </div>
      <input type="file" multiple accept={accept} className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
    </label>
  );

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4" style={{ borderBottom: `3px solid ${C.green}` }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.green }}>Conciliação fiscal × bancária</div>
            <h1 className="text-2xl font-bold mt-0.5">Notas recebidas e pagamentos — desde jan/2026</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: C.blue, background: C.blueSoft }}>
              Importar estado
              <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files[0]) importarEstado(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <button onClick={exportarEstado} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: C.green, background: C.greenSoft }}>
              Exportar estado
            </button>
            <button
              onClick={() => (confirmClear ? limparTudo() : setConfirmClear(true))}
              className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={confirmClear ? { color: "#fff", background: C.red } : { color: C.red, background: C.redSoft }}
            >
              {confirmClear ? "Clique de novo para confirmar exclusão" : "Limpar tudo"}
            </button>
            {onLogout && (
              <button onClick={onLogout} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: C.inkSoft, background: "#EEF1F0" }}>
                Sair
              </button>
            )}
          </div>
        </div>

        {/* Totais */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          {[
            ["Total em notas", totais.tNotas, C.ink],
            ["Total pago (saídas)", totais.tPagos, C.blue],
            ["Pendente de pagamento", totais.tPendente, C.amber],
            ["Sem NF — identificado", totais.tSemNFFlag, C.amber],
            ["Sem NF — pendente", totais.tSemNota, C.red],
          ].map(([label, v, color]) => (
            <div key={label} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color }}>{fmtBRL(v)}</div>
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
              style={tab === k ? { background: C.card, color: C.green, borderBottom: `2px solid ${C.green}` } : { color: C.inkSoft }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-b-xl rounded-tr-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          {progress && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: C.blueSoft }}>
              <div className="text-sm font-semibold" style={{ color: C.blue }}>
                {progress.label}… {progress.done}/{progress.total}
              </div>
              <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: "#fff" }}>
                <div className="h-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%`, background: C.blue }} />
              </div>
            </div>
          )}
          {errors.length > 0 && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: errors[0].startsWith("✓") ? C.greenSoft : C.redSoft, color: errors[0].startsWith("✓") ? C.green : C.red }}>
              {errors.map((e, i) => (<div key={i}>{e.startsWith("✓") ? e : `⚠ ${e}`}</div>))}
              <button className="text-xs underline mt-1" onClick={() => setErrors([])}>fechar</button>
            </div>
          )}

          {/* ---- NOTAS ---- */}
          {tab === "notas" && (
            <div className="space-y-4">
              <UploadBox
                accept=".pdf"
                onFiles={handleNotas}
                title="Enviar notas fiscais (PDF)"
                hint="Arraste os PDFs das notas (DANFE / NFSe). A IA extrai fornecedor, CNPJ, número, data e valor."
              />
              {invoices.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
                      <Th>Fornecedor</Th><Th>CNPJ</Th><Th>Nº nota</Th><Th>Emissão</Th><Th right>Valor</Th><Th right>Pago</Th><Th></Th>
                    </tr></thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                          <Td>{inv.fornecedor}<div className="text-xs" style={{ color: C.inkSoft }}>{inv.arquivo}</div></Td>
                          <Td mono>{inv.cnpj || "—"}</Td>
                          <Td mono>{inv.numero}</Td>
                          <Td mono>{fmtData(inv.dataEmissao)}</Td>
                          <Td right mono>{fmtBRL(inv.valor)}</Td>
                          <Td right mono>{fmtBRL(pagoPorNota[inv.id] || 0)}</Td>
                          <Td right>
                            <button className="text-xs" style={{ color: C.red }} onClick={() => {
                              setInvoices((p) => p.filter((x) => x.id !== inv.id));
                              setLinks((p) => p.filter((l) => l.invoiceId !== inv.id));
                            }}>excluir</button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---- EXTRATOS ---- */}
          {tab === "extratos" && (
            <div className="space-y-4">
              <UploadBox
                accept=".ofx,.xlsx,.xls,.csv,.txt,.pdf"
                onFiles={handleExtratos}
                title="Enviar extratos bancários (OFX, Excel, CSV ou PDF)"
                hint="Somente as saídas (débitos/pagamentos) são importadas. OFX, Excel e CSV são lidos localmente; PDF usa IA. Extratos Itaú 'Lançamentos' (.xlsx) são reconhecidos automaticamente, incluindo Razão Social e CNPJ do favorecido."
              />
              {payments.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
                      <Th>Data</Th><Th>Descrição</Th><Th right>Valor</Th><Th>Status</Th><Th></Th>
                    </tr></thead>
                    <tbody>
                      {payments.map((p) => {
                        const ls = linksPorPagamento[p.id] || [];
                        return (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                            <Td mono>{fmtData(p.data)}</Td>
                            <Td>{p.descricao}<div className="text-xs" style={{ color: C.inkSoft }}>{p.arquivo}</div></Td>
                            <Td right mono>{fmtBRL(p.valor)}</Td>
                            <Td>{ls.length ? <Chip tone="green">Com nota</Chip> : semNF[p.id] ? <Chip tone="amber">Sem NF — {semNF[p.id].motivo}</Chip> : <Chip tone="red">Sem nota</Chip>}</Td>
                            <Td right>
                              <button className="text-xs" style={{ color: C.red }} onClick={() => {
                                setPayments((prev) => prev.filter((x) => x.id !== p.id));
                                setLinks((prev) => prev.filter((l) => l.paymentId !== p.id));
                              }}>excluir</button>
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

          {/* ---- CONCILIAR ---- */}
          {tab === "conciliar" && (() => {
            // calcula restante diretamente de links para garantir valores frescos
            const restantePorNota = {};
            invoices.forEach((inv) => {
              const pago = links.filter((l) => l.invoiceId === inv.id).reduce((s, l) => s + l.valor, 0);
              restantePorNota[inv.id] = Math.max(0, inv.valor - pago);
            });
            const alocadoPorPagamento = {};
            payments.forEach((p) => {
              alocadoPorPagamento[p.id] = links.filter((l) => l.paymentId === p.id).reduce((s, l) => s + l.valor, 0);
            });
            const notasAbertas = invoices.filter((inv) => restantePorNota[inv.id] > 0.005);
            return (
            <div className="space-y-3">
              {pendentesConciliar.length === 0 && (
                <div className="text-sm py-8 text-center" style={{ color: C.inkSoft }}>
                  Nenhum pagamento pendente de conciliação. Envie notas e extratos nas abas anteriores.
                </div>
              )}
              {pendentesConciliar.map((p) => {
                const alocado = alocadoPorPagamento[p.id] || 0;
                const disponivel = p.valor - alocado;
                const sugs = sugerir(p, invoices, links);
                return (
                  <div key={p.id} className="rounded-xl p-3" style={{ border: `1px solid ${C.line}` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm">{fmtData(p.data)}</span>{" "}
                        <span className="text-sm font-semibold">{p.descricao || "(sem descrição)"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: C.inkSoft }}>total: {fmtBRL(p.valor)}</span>
                        <span className="font-mono font-bold" style={{ color: C.blue }}>disponível: {fmtBRL(disponivel)}</span>
                      </div>
                    </div>
                    {sugs.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {sugs.map((s) => (
                          <div key={s.inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: C.bg }}>
                            <div className="text-sm">
                              <Chip tone={s.score >= 60 ? "green" : s.score >= 30 ? "amber" : "gray"}>
                                {s.score >= 60 ? "Alta" : s.score >= 30 ? "Média" : "Baixa"}
                              </Chip>{" "}
                              <strong>{s.inv.fornecedor}</strong> · NF {s.inv.numero} · restante {fmtBRL(restantePorNota[s.inv.id])}
                              <span className="text-xs ml-1" style={{ color: C.inkSoft }}>({s.reasons.join(", ")})</span>
                            </div>
                            <button onClick={() => vincular(p, s.inv)} className="px-3 py-1 rounded-lg text-xs font-bold text-white" style={{ background: C.green }}>
                              Vincular
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs mt-2" style={{ color: C.inkSoft }}>Sem sugestões automáticas para este pagamento.</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        className="text-sm rounded-lg px-2 py-1"
                        style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                        value={manualSel[p.id] || ""}
                        onChange={(e) => setManualSel((m) => ({ ...m, [p.id]: e.target.value }))}
                      >
                        <option value="">Vincular manualmente a…</option>
                        {notasAbertas.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.fornecedor} · NF {inv.numero} · restante {fmtBRL(restantePorNota[inv.id])}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!manualSel[p.id]}
                        onClick={() => {
                          const inv = invoices.find((i) => i.id === manualSel[p.id]);
                          if (inv) vincular(p, inv);
                          setManualSel((m) => ({ ...m, [p.id]: "" }));
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-white disabled:opacity-40"
                        style={{ background: C.blue }}
                      >
                        OK
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <input
                          type="text"
                          placeholder="Motivo (ex: folha, adiantamento, imposto…)"
                          className="text-xs rounded-lg px-2 py-1 w-60"
                          style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                          value={semNFInput[p.id] || ""}
                          onChange={(e) => setSemNFInput((m) => ({ ...m, [p.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && semNFInput[p.id]?.trim()) {
                              setSemNF((m) => ({ ...m, [p.id]: { motivo: semNFInput[p.id].trim() } }));
                            }
                          }}
                        />
                        <button
                          disabled={!semNFInput[p.id]?.trim()}
                          onClick={() => setSemNF((m) => ({ ...m, [p.id]: { motivo: semNFInput[p.id].trim() } }))}
                          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40"
                          style={{ background: C.amberSoft, color: C.amber }}
                        >
                          Marcar sem NF
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {links.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>Vínculos confirmados</h3>
                  {links.map((l) => {
                    const p = payments.find((x) => x.id === l.paymentId);
                    const inv = invoices.find((x) => x.id === l.invoiceId);
                    if (!p || !inv) return null;
                    return (
                      <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm" style={{ borderBottom: `1px solid ${C.line}` }}>
                        <div>
                          {fmtData(p.data)} · {p.descricao.slice(0, 50)} → <strong>{inv.fornecedor}</strong> NF {inv.numero}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono">{fmtBRL(l.valor)}</span>
                          <button className="text-xs" style={{ color: C.red }} onClick={() => desvincular(l.id)}>desvincular</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })()}

          {/* ---- SEM NF ---- */}
          {tab === "semNF" && (
            <div className="space-y-2">
              {Object.keys(semNF).length === 0 && (
                <div className="text-sm py-8 text-center" style={{ color: C.inkSoft }}>
                  Nenhum pagamento marcado como Sem NF ainda. Use a aba Conciliar para identificar os pagamentos sem documento fiscal.
                </div>
              )}
              {Object.keys(semNF).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
                      <Th>Data</Th><Th>Descrição</Th><Th right>Valor</Th><Th>Motivo / Justificativa</Th><Th></Th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(semNF).map(([pid, { motivo }]) => {
                        const p = payments.find((x) => x.id === pid);
                        if (!p) return null;
                        return (
                          <tr key={pid} style={{ borderBottom: `1px solid ${C.line}`, background: C.amberSoft }}>
                            <Td mono>{fmtData(p.data)}</Td>
                            <Td>{p.descricao}<div className="text-xs" style={{ color: C.inkSoft }}>{p.arquivo}</div></Td>
                            <Td right mono>{fmtBRL(p.valor)}</Td>
                            <Td>
                              <input
                                type="text"
                                className="text-xs rounded px-2 py-1 w-full"
                                style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                                value={motivo}
                                onChange={(e) => setSemNF((m) => ({ ...m, [pid]: { motivo: e.target.value } }))}
                              />
                            </Td>
                            <Td right>
                              <button
                                className="text-xs"
                                style={{ color: C.red }}
                                onClick={() => setSemNF((m) => { const n = { ...m }; delete n[pid]; return n; })}
                              >
                                remover flag
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

          {/* ---- RELATÓRIOS ---- */}
          {tab === "relatorios" && (
            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold">A — Notas × pagamentos</h3>
                  <button
                    className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: C.green }}
                    onClick={() =>
                      exportCSV(
                        "relatorio_A_notas.csv",
                        ["Fornecedor", "CNPJ", "Nota", "Emissao", "Valor nota", "Valor pago", "Valor pendente", "Tem nota emitida", "Status"],
                        relatorioA.map((r) => [
                          r.inv.fornecedor, r.inv.cnpj, r.inv.numero, fmtData(r.inv.dataEmissao),
                          r.inv.valor.toFixed(2).replace(".", ","), r.pago.toFixed(2).replace(".", ","),
                          r.pendente.toFixed(2).replace(".", ","), "Sim", r.status,
                        ]),
                        setSaida
                      )
                    }
                  >
                    Exportar CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
                      <Th>Fornecedor</Th><Th>Nota</Th><Th right>Valor nota</Th><Th right>Pago</Th><Th right>Pendente</Th><Th>Nota emitida</Th><Th>Status</Th>
                    </tr></thead>
                    <tbody>
                      {relatorioA.map((r) => (
                        <tr key={r.inv.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                          <Td>{r.inv.fornecedor}</Td>
                          <Td mono>{r.inv.numero}</Td>
                          <Td right mono>{fmtBRL(r.inv.valor)}</Td>
                          <Td right mono>{fmtBRL(r.pago)}</Td>
                          <Td right mono>{fmtBRL(r.pendente)}</Td>
                          <Td><Chip tone="green">Sim</Chip></Td>
                          <Td>
                            <Chip tone={r.status === "Paga" ? "green" : r.status === "Parcial" ? "amber" : "red"}>{r.status}</Chip>
                          </Td>
                        </tr>
                      ))}
                      {relatorioA.length === 0 && (
                        <tr><Td>Nenhuma nota importada ainda.</Td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold">B — Pagamentos × existência de nota</h3>
                  <button
                    className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: C.green }}
                    onClick={() =>
                      exportCSV(
                        "relatorio_B_pagamentos.csv",
                        ["Data", "Fornecedor / Descricao", "Valor pago", "Tem nota emitida", "Flag Sem NF", "Motivo"],
                        relatorioB.map((r) => [
                          fmtData(r.p.data), r.fornecedor || r.p.descricao,
                          r.p.valor.toFixed(2).replace(".", ","),
                          r.temNota ? "Sim" : "Nao",
                          r.flagSemNF ? "Sim" : "",
                          r.motivo,
                        ]),
                        setSaida
                      )
                    }
                  >
                    Exportar CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
                      <Th>Data</Th><Th>Fornecedor / descrição</Th><Th right>Valor pago</Th><Th>Tem nota?</Th><Th>Motivo (sem NF)</Th>
                    </tr></thead>
                    <tbody>
                      {relatorioB.map((r) => (
                        <tr key={r.p.id} style={{ borderBottom: `1px solid ${C.line}`, background: r.temNota ? "transparent" : r.flagSemNF ? C.amberSoft : C.redSoft }}>
                          <Td mono>{fmtData(r.p.data)}</Td>
                          <Td>{r.fornecedor ? <><strong>{r.fornecedor}</strong><div className="text-xs" style={{ color: C.inkSoft }}>{r.p.descricao}</div></> : r.p.descricao}</Td>
                          <Td right mono>{fmtBRL(r.p.valor)}</Td>
                          <Td>{r.temNota ? <Chip tone="green">Sim</Chip> : r.flagSemNF ? <Chip tone="amber">Sem NF</Chip> : <Chip tone="red">Não</Chip>}</Td>
                          <Td><span className="text-xs" style={{ color: C.amber }}>{r.motivo}</span></Td>
                        </tr>
                      ))}
                      {relatorioB.length === 0 && (
                        <tr><Td>Nenhum extrato importado ainda.</Td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="text-xs mt-4 text-center" style={{ color: C.inkSoft }}>
          Os dados extraídos ficam salvos automaticamente entre sessões. PDFs são processados por IA — confira valores antes de fechar o mês.
        </div>
      </div>

      {/* Modal fallback de exportação (se o download direto for bloqueado) */}
      {saida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => { setSaida(null); setCopiado(false); }}>
          <div className="rounded-xl p-4 w-full max-w-2xl" style={{ background: C.card, maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Exportar: <span className="font-mono">{saida.filename}</span></h3>
              <button onClick={() => { setSaida(null); setCopiado(false); }} className="text-sm" style={{ color: C.inkSoft }}>✕</button>
            </div>
            <p className="text-xs mb-2" style={{ color: C.inkSoft }}>
              O download automático foi bloqueado pelo navegador. Copie o conteúdo abaixo e cole num arquivo <span className="font-mono">{saida.filename.endsWith(".json") ? ".json" : ".csv"}</span> no seu computador.
            </p>
            <textarea
              id="export-ta-helper"
              readOnly
              value={saida.content}
              className="w-full text-xs font-mono rounded-lg p-2"
              style={{ border: `1px solid ${C.line}`, height: "40vh", background: C.bg }}
              onFocus={(e) => e.target.select()}
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(saida.content);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2500);
                  } catch (e) {
                    // fallback execCommand
                    const ta = document.querySelector("#export-ta-helper");
                    if (ta) { ta.select(); document.execCommand("copy"); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white"
                style={{ background: copiado ? C.green : C.blue }}
              >
                {copiado ? "✓ Copiado!" : "Copiar tudo"}
              </button>
              <span className="text-xs" style={{ color: C.inkSoft }}>Selecione o texto e copie (Ctrl/Cmd+C) se o botão não funcionar.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
