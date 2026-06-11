import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import ConciliacaoFiscal from "./ConciliacaoFiscal.jsx";
import Login from "./components/Login.jsx";

function App() {
  const [auth, setAuth] = useState(null); // null = carregando, false = deslogado, true = logado

  // Verifica se já existe uma sessão válida (cookie httpOnly setado pela função /api/login)
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

  return <ConciliacaoFiscal onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
