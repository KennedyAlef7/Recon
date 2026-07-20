import React, { useState } from "react";

const C = {
  bg: "#F4F6F5",
  card: "#FFFFFF",
  ink: "#1A2421",
  inkSoft: "#5C6B66",
  line: "#DDE4E1",
  green: "#0E6B4F",
  greenSoft: "#E3F0EB",
  sidebar: "#1A2421",
  sidebarHover: "#2C3B36",
  sidebarActive: "#0E6B4F",
};

const MODULOS = [
  {
    key: "conciliacao",
    label: "Conciliação Financeira",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    desc: "Importação, conciliação de notas e extratos",
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-1 2-2.5 3s-2.5 1.5-2.5 3a2.5 2.5 0 0 0 5 0" />
      </svg>
    ),
    desc: "Cadastro de fornecedores, provisões e descontos",
  },
  {
    key: "extratos",
    label: "Extratos",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    desc: "Armazenamento e download de extratos por mês",
  },
  {
    key: "clientes",
    label: "Clientes",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    desc: "Faturamento e distribuição de receita por cliente",
  },
  {
    key: "caixa",
    label: "Caixa",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    desc: "Evolução de caixa e margem líquida mensal",
  },
];

export default function AppShell({ onLogout, children }) {
  const [modulo, setModulo] = useState("conciliacao");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", fontFamily: "ui-sans-serif, system-ui, sans-serif", background: C.bg }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? 220 : 56,
          background: C.sidebar,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          transition: "width 0.2s",
          overflow: "hidden",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: sidebarOpen ? "20px 20px 12px" : "20px 0 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: sidebarOpen ? "flex-start" : "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: C.green,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          {sidebarOpen && (
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>DM Tech</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, lineHeight: 1.2 }}>Sistema Financeiro</div>
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px",
            margin: "8px auto 0",
            borderRadius: 6,
            color: "rgba(255,255,255,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
          }}
          title={sidebarOpen ? "Recolher menu" : "Expandir menu"}
        >
          {sidebarOpen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {MODULOS.map((m) => {
            const active = modulo === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setModulo(m.key)}
                title={!sidebarOpen ? m.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: sidebarOpen ? "9px 12px" : "9px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  background: active ? C.sidebarActive : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.55)",
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  transition: "background 0.15s, color 0.15s",
                  width: "100%",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = C.sidebarHover; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; } }}
              >
                <span style={{ flexShrink: 0 }}>{m.icon}</span>
                {sidebarOpen && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={onLogout}
            title={!sidebarOpen ? "Sair" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: sidebarOpen ? "9px 12px" : "9px 0",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              fontSize: 13,
              width: "100%",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {sidebarOpen && "Sair"}
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        {children(modulo)}
      </main>
    </div>
  );
}
