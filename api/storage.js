import { estaAutenticado } from "./_auth.js";

const ALLOWED_KEY = /^(conciliacao|financeiro):/;

async function redisCmd(url, token, command) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const { result, error } = await r.json();
  if (error) throw new Error(error);
  return result;
}

export default async function handler(req, res) {
  if (!estaAutenticado(req)) {
    return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res
      .status(503)
      .json({ error: "Banco de dados não configurado. Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN." });
  }

  try {
    if (req.method === "GET") {
      const { key } = req.query;
      if (!key || !ALLOWED_KEY.test(key)) return res.status(400).json({ error: "key inválida" });
      const value = await redisCmd(url, token, ["GET", key]);
      return res.json({ value: value ?? null });
    }

    if (req.method === "POST") {
      const { key, value } = req.body ?? {};
      if (!key || !ALLOWED_KEY.test(key)) return res.status(400).json({ error: "key inválida" });
      if (value === undefined) return res.status(400).json({ error: "value obrigatório" });
      // sem TTL: dados persistentes
      await redisCmd(url, token, ["SET", key, value]);
      return res.json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { key } = req.query;
      if (!key || !ALLOWED_KEY.test(key)) return res.status(400).json({ error: "key inválida" });
      await redisCmd(url, token, ["DEL", key]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
