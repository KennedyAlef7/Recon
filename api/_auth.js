import crypto from "crypto";

const COOKIE_NAME = "cf_session";
const MAX_AGE = 60 * 60 * 12; // 12 horas

// Token assinado simples (HMAC). Não guarda dados sensíveis: apenas um carimbo
// de "autenticado" + expiração, assinado com AUTH_SECRET para não ser forjável.
export function criarToken(secret) {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `auth.${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verificarToken(token, secret) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tag, exp, sig] = parts;
  const payload = `${tag}.${exp}`;
  const esperado = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  // comparação em tempo constante
  if (sig.length !== esperado.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return false;
  if (Date.now() > Number(exp)) return false;
  return true;
}

export function lerCookie(req, nome = COOKIE_NAME) {
  const raw = req.headers.cookie || "";
  const found = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(nome + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

export function setCookieHeader(token) {
  const flags = ["HttpOnly", "Path=/", "SameSite=Strict", `Max-Age=${MAX_AGE}`, "Secure"];
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${flags.join("; ")}`;
}

export function limparCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0; Secure`;
}

export function estaAutenticado(req) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  return verificarToken(lerCookie(req), secret);
}

export { COOKIE_NAME };
