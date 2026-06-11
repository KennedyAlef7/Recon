import { limparCookieHeader } from "./_auth.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", limparCookieHeader());
  return res.status(200).json({ ok: true });
}
