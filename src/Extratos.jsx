import React, { useState, useEffect, useRef, useMemo } from "react";
import { upload } from "@vercel/blob/client";

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

const MESES_LABEL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMes(ym) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return `${MESES_LABEL[parseInt(m, 10) - 1]} / ${y}`;
}

function fmtBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Detecta mês a partir do nome do arquivo (ex: "extrato_06_2026.ofx" → "2026-06")
function detectarMes(filename) {
  const s = filename.replace(/[_\-\.]/g, " ");
  // YYYY MM ou MM YYYY ou YYYYMM
  let m;
  m = s.match(/(\d{4})\s+(\d{2})/);
  if (m && parseInt(m[2]) >= 1 && parseInt(m[2]) <= 12) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{2})\s+(\d{4})/);
  if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return mesAtual();
}

const EXT_ICON = {
  ofx: { label: "OFX", bg: "#E8F0FE", color: "#1A73E8" },
  xlsx: { label: "XLS", bg: "#E6F4EA", color: "#1E8E3E" },
  xls:  { label: "XLS", bg: "#E6F4EA", color: "#1E8E3E" },
  csv:  { label: "CSV", bg: "#FEF3C7", color: "#B45309" },
  txt:  { label: "TXT", bg: "#F3F4F6", color: "#6B7280" },
  pdf:  { label: "PDF", bg: "#FDE8E8", color: "#C53030" },
};

function ExtIcon({ filename }) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const cfg = EXT_ICON[ext] || { label: ext.toUpperCase(), bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span
      style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.05em", flexShrink: 0 }}
    >
      {cfg.label}
    </span>
  );
}

// Lê metadados do Redis
async function carregarMetadados() {
  const r = await fetch("/api/storage?key=extratos%3Ametadata", { credentials: "include" });
  if (!r.ok) return [];
  const { value } = await r.json();
  return value ? JSON.parse(value) : [];
}

async function salvarMetadados(lista) {
  await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key: "extratos:metadata", value: JSON.stringify(lista) }),
  });
}

export default function Extratos() {
  const [arquivos, setArquivos] = useState([]); // metadados
  const [loaded, setLoaded] = useState(false);
  const [uploads, setUploads] = useState([]); // [{id, filename, mes, progresso, erro}]
  const [mesFiltro, setMesFiltro] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // id do arquivo
  const [dragging, setDragging] = useState(false);
  // Mês padrão para novos uploads (detectado por arquivo, mas ajustável)
  const [mesUpload, setMesUpload] = useState(mesAtual());
  const fileInputRef = useRef(null);

  useEffect(() => {
    carregarMetadados().then((lista) => { setArquivos(lista); setLoaded(true); });
  }, []);

  // Meses disponíveis nos metadados
  const mesesDisponiveis = useMemo(() => {
    const set = new Set(arquivos.map((a) => a.mes).filter(Boolean));
    return [...set].sort().reverse();
  }, [arquivos]);

  // Agrupa por mês
  const porMes = useMemo(() => {
    const filtrados = mesFiltro ? arquivos.filter((a) => a.mes === mesFiltro) : arquivos;
    const grupos = {};
    filtrados.forEach((a) => {
      const k = a.mes || "sem-mes";
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(a);
    });
    return Object.entries(grupos)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([mes, itens]) => ({ mes, itens: itens.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) }));
  }, [arquivos, mesFiltro]);

  const totalSize = arquivos.reduce((s, a) => s + (a.size || 0), 0);

  async function processarArquivos(files) {
    const lista = Array.from(files);
    if (!lista.length) return;

    // Cria entradas de progresso
    const novasEntradas = lista.map((f) => ({
      id: uid(),
      filename: f.name,
      mes: detectarMes(f.name),
      progresso: 0,
      erro: null,
      file: f,
    }));
    setUploads((prev) => [...prev, ...novasEntradas]);

    for (const entrada of novasEntradas) {
      try {
        // Upload direto para Vercel Blob via client SDK
        const blob = await upload(
          `extratos/${entrada.mes}/${entrada.id}_${entrada.file.name}`,
          entrada.file,
          {
            access: "public",
            handleUploadUrl: "/api/extratos-upload",
            onUploadProgress: ({ percentage }) => {
              setUploads((prev) => prev.map((u) => u.id === entrada.id ? { ...u, progresso: percentage } : u));
            },
          }
        );

        // Salva metadado
        const meta = {
          id: entrada.id,
          filename: entrada.file.name,
          mes: mesUpload, // usa o mês selecionado pelo usuário
          size: entrada.file.size,
          type: entrada.file.name.split(".").pop().toLowerCase(),
          url: blob.url,
          uploadedAt: new Date().toISOString(),
        };

        setArquivos((prev) => {
          const nova = [...prev, meta];
          salvarMetadados(nova);
          return nova;
        });

        setUploads((prev) => prev.map((u) => u.id === entrada.id ? { ...u, progresso: 100, done: true } : u));
      } catch (e) {
        setUploads((prev) => prev.map((u) => u.id === entrada.id ? { ...u, erro: e.message } : u));
      }
    }

    // Remove entradas concluídas após 3s
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => !u.done));
    }, 3000);
  }

  async function excluirArquivo(arquivo) {
    try {
      await fetch(`/api/extratos-delete?url=${encodeURIComponent(arquivo.url)}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch (_) { /* se o blob já não existe, segue */ }

    setArquivos((prev) => {
      const nova = prev.filter((a) => a.id !== arquivo.id);
      salvarMetadados(nova);
      return nova;
    });
    setConfirmDelete(null);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    processarArquivos(e.dataTransfer.files);
  }

  // Meses para o seletor de upload (últimos 12 meses)
  const mesesOpcoes = useMemo(() => {
    const d = new Date();
    const opts = [];
    for (let i = 0; i < 13; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      opts.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4" style={{ borderBottom: `3px solid ${C.amber}` }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.amber }}>Módulo Extratos</div>
            <h1 className="text-2xl font-bold mt-0.5">Armazenamento de extratos bancários</h1>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            ["Arquivos armazenados", String(arquivos.length), C.ink],
            ["Meses cobertos", String(new Set(arquivos.map((a) => a.mes)).size), C.blue],
            ["Espaço utilizado", fmtBytes(totalSize), C.amber],
          ].map(([label, v, color]) => (
            <div key={label} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1" style={{ color }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Área de upload */}
        <div className="mt-6 space-y-3">
          {/* Seletor de mês de referência */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>Mês de referência dos arquivos</label>
              <select
                className="text-sm rounded-lg px-3 py-1.5"
                style={{ border: `1px solid ${C.line}`, background: "#fff", minWidth: 180 }}
                value={mesUpload}
                onChange={(e) => setMesUpload(e.target.value)}
              >
                {mesesOpcoes.map((m) => (
                  <option key={m} value={m}>{fmtMes(m)}</option>
                ))}
              </select>
            </div>
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: C.blueSoft, color: C.blue }}>
              Os arquivos enviados serão associados ao mês selecionado acima.
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl p-10 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${dragging ? C.amber : C.line}`,
              background: dragging ? C.amberSoft : C.card,
            }}
          >
            <div style={{ color: dragging ? C.amber : C.inkSoft }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="text-base font-semibold" style={{ color: C.ink }}>
                Arraste os arquivos ou clique para selecionar
              </div>
              <div className="text-sm mt-1">OFX · Excel (XLS/XLSX) · CSV · TXT · PDF</div>
              <div className="mt-4 inline-block px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.amber }}>
                Escolher arquivos
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".ofx,.xlsx,.xls,.csv,.txt,.pdf"
              className="hidden"
              onChange={(e) => { processarArquivos(e.target.files); e.target.value = ""; }}
            />
          </div>

          {/* Progresso de uploads */}
          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((u) => (
                <div key={u.id} className="rounded-lg px-4 py-3 flex items-center gap-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                  <ExtIcon filename={u.filename} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{u.filename}</div>
                    {u.erro ? (
                      <div className="text-xs" style={{ color: C.red }}>Erro: {u.erro}</div>
                    ) : u.done ? (
                      <div className="text-xs" style={{ color: C.green }}>Upload concluído</div>
                    ) : (
                      <div className="mt-1">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.line }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${u.progresso}%`, background: C.amber }} />
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{u.progresso}%</div>
                      </div>
                    )}
                  </div>
                  {(u.done || u.erro) && (
                    <button onClick={() => setUploads((p) => p.filter((x) => x.id !== u.id))} style={{ color: C.inkSoft, fontSize: 16 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filtro por mês */}
        {arquivos.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>Filtrar por mês:</div>
            <button
              onClick={() => setMesFiltro("")}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={!mesFiltro ? { background: C.amber, color: "#fff" } : { background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}
            >
              Todos
            </button>
            {mesesDisponiveis.map((m) => (
              <button
                key={m}
                onClick={() => setMesFiltro(m === mesFiltro ? "" : m)}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={mesFiltro === m ? { background: C.amber, color: "#fff" } : { background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}
              >
                {fmtMes(m)}
              </button>
            ))}
          </div>
        )}

        {/* Lista de arquivos agrupada por mês */}
        {loaded && arquivos.length === 0 && uploads.length === 0 && (
          <div className="mt-10 text-center text-sm" style={{ color: C.inkSoft }}>
            Nenhum extrato armazenado ainda. Envie arquivos acima.
          </div>
        )}

        <div className="mt-4 space-y-6">
          {porMes.map(({ mes, itens }) => (
            <div key={mes}>
              {/* Cabeçalho do mês */}
              <div
                className="flex items-center justify-between px-4 py-2 rounded-lg mb-2"
                style={{ background: C.amberSoft }}
              >
                <div className="font-bold text-sm" style={{ color: C.amber }}>
                  {fmtMes(mes)}
                  <span className="ml-2 text-xs font-normal" style={{ color: C.inkSoft }}>
                    {itens.length} arquivo(s) · {fmtBytes(itens.reduce((s, a) => s + (a.size || 0), 0))}
                  </span>
                </div>
              </div>

              {/* Arquivos do mês */}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                {itens.map((arquivo, idx) => (
                  <div
                    key={arquivo.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderBottom: idx < itens.length - 1 ? `1px solid ${C.line}` : "none",
                      background: C.card,
                    }}
                  >
                    <ExtIcon filename={arquivo.filename} />

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{arquivo.filename}</div>
                      <div className="text-xs mt-0.5 flex gap-3" style={{ color: C.inkSoft }}>
                        <span>{fmtBytes(arquivo.size)}</span>
                        <span>Enviado em {new Date(arquivo.uploadedAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>

                    {/* Botões */}
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={arquivo.url}
                        download={arquivo.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
                        style={{ background: C.blueSoft, color: C.blue, textDecoration: "none" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download
                      </a>

                      {confirmDelete === arquivo.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => excluirArquivo(arquivo)}
                            className="text-xs font-bold px-2 py-1.5 rounded-lg text-white"
                            style={{ background: C.red }}
                          >
                            Confirmar exclusão
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs px-2 py-1.5 rounded-lg"
                            style={{ background: "#EEF1F0", color: C.inkSoft }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(arquivo.id)}
                          className="text-xs px-2 py-1.5 rounded-lg"
                          style={{ color: C.red, background: C.redSoft }}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs mt-6 text-center" style={{ color: C.inkSoft }}>
          Arquivos armazenados no Vercel Blob · Metadados salvos no Redis · Downloads disponíveis a qualquer momento
        </div>
      </div>
    </div>
  );
}
