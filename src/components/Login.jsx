import React, { useState } from "react";

const C = {
  bg: "#F4F6F5",
  card: "#FFFFFF",
  ink: "#1A2421",
  inkSoft: "#5C6B66",
  line: "#DDE4E1",
  green: "#0E6B4F",
  red: "#A93226",
  redSoft: "#F8E5E2",
};

export default function Login({ onSuccess }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ usuario, senha }),
      });
      if (r.ok) {
        onSuccess();
      } else {
        const d = await r.json().catch(() => ({}));
        setErro(d.error || "Usuário ou senha inválidos.");
      }
    } catch (_) {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <form onSubmit={entrar} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: C.green }}>
          Conciliação fiscal × bancária
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 20px", color: C.ink }}>Entrar</h1>

        <label style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft }}>Usuário</label>
        <input
          type="text"
          autoComplete="username"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", margin: "6px 0 16px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14 }}
        />

        <label style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft }}>Senha</label>
        <input
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", margin: "6px 0 16px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14 }}
        />

        {erro && (
          <div style={{ background: C.redSoft, color: C.red, fontSize: 13, padding: "8px 12px", borderRadius: 10, marginBottom: 16 }}>
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={carregando || !usuario || !senha}
          style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: carregando || !usuario || !senha ? 0.5 : 1 }}
        >
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
