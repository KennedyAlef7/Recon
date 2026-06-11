import { estaAutenticado } from "./_auth.js";

export default function handler(req, res) {
  if (estaAutenticado(req)) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false });
}
