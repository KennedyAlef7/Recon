/**
 * POST /api/extratos-upload
 * Gera token para upload direto do browser ao Vercel Blob (sem passar pelo serverless).
 * Após o upload, o cliente chama /api/extratos-metadata para salvar os metadados.
 *
 * Variável de ambiente necessária: BLOB_READ_WRITE_TOKEN (gerada no dashboard do Vercel)
 */

import { handleUpload } from "@vercel/blob/client";
import { estaAutenticado } from "./_auth.js";

export default async function handler(req, res) {
  if (!estaAutenticado(req)) {
    return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
  }

  const jsonBody = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on("error", reject);
  });

  try {
    const response = await handleUpload({
      body: jsonBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Só aceita extensões de extrato bancário
        const allowed = /\.(ofx|xlsx|xls|csv|txt|pdf)$/i;
        if (!allowed.test(pathname)) {
          throw new Error("Formato não suportado. Use OFX, XLSX, XLS, CSV, TXT ou PDF.");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "text/plain",
            "application/octet-stream",
          ],
          // Prefixo de caminho no Blob Storage
          tokenPayload: JSON.stringify({ ok: true }),
        };
      },
      onUploadCompleted: async () => {
        // Metadados são salvos pelo cliente após o upload
      },
    });

    return res.json(response);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
