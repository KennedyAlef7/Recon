import { estaAutenticado } from "./_auth.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // Bloqueia uso da API sem sessão válida — protege seus créditos da Anthropic
  if (!estaAutenticado(req)) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada no servidor" });
  }

  const { messages, max_tokens = 1500 } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "Payload inválido: 'messages' é obrigatório" });
  }

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens, messages }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || "Erro na API da Anthropic";
      return res.status(r.status).json({ error: msg });
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: "Falha ao contatar a Anthropic: " + e.message });
  }
}
