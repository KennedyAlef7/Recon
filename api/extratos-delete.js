/**
 * DELETE /api/extratos-delete?url=<blobUrl>
 * Remove o arquivo do Vercel Blob.
 * Os metadados são removidos pelo cliente via /api/storage.
 */

import { del } from "@vercel/blob";
import { estaAutenticado } from "./_auth.js";

export default async function handler(req, res) {
  if (!estaAutenticado(req)) {
    return res.status(401).json({ error: "Sessão expirada." });
  }
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url obrigatória" });

  try {
    await del(url);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
