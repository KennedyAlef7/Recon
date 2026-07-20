import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppShell from "./AppShell.jsx";
import ConciliacaoFiscal from "./ConciliacaoFiscal.jsx";
import Financeiro from "./Financeiro.jsx";
import Extratos from "./Extratos.jsx";
import Clientes from "./Clientes.jsx";
import Caixa from "./Caixa.jsx";
import Login from "./components/Login.jsx";

function App() {
  const [auth, setAuth] = useState(null); // null = carregando, false = deslogado, true = logado

  useEffect(() => {
    fetch("/api/session", { credentials: "include" })
      .then((r) => setAuth(r.ok))
      .catch(() => setAuth(false));
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch (_) {}
    setAuth(false);
  }

  if (auth === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#5C6B66", fontFamily: "system-ui" }}>
        Carregando…
      </div>
    );
  }

  if (!auth) return <Login onSuccess={() => setAuth(true)} />;

  return (
    <AppShell onLogout={handleLogout}>
      {(modulo) => {
        if (modulo === "conciliacao") return <ConciliacaoFiscal />;
        if (modulo === "financeiro") return <Financeiro />;
        if (modulo === "extratos") return <Extratos />;
        if (modulo === "clientes") return <Clientes />;
        if (modulo === "caixa") return <Caixa />;
        return null;
      }}
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
