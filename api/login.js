import crypto from "crypto";
import { criarToken, setCookieHeader } from "./_auth.js";

// Comparação em tempo constante para evitar timing attacks
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { APP_USER, APP_PASSWORD, AUTH_SECRET } = process.env;
  if (!APP_USER || !APP_PASSWORD || !AUTH_SECRET) {
    return res.status(500).json({ error: "Servidor sem credenciais configuradas (.env)" });
  }

  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) {
    return res.status(400).json({ error: "Informe usuário e senha" });
  }

  const ok = igualSeguro(usuario, APP_USER) && igualSeguro(senha, APP_PASSWORD);
  if (!ok) {
    return res.status(401).json({ error: "Usuário ou senha inválidos" });
  }

  res.setHeader("Set-Cookie", setCookieHeader(criarToken(AUTH_SECRET)));
  return res.status(200).json({ ok: true });
}
