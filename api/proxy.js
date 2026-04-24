const AI_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-extension-secret");
  res.setHeader("Access-Control-Max-Age", "86400");
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = (process.env.API_KEY || "").trim();
  const expectedSecret = (process.env.EXTENSION_SECRET || "").trim();

  if (!apiKey || !expectedSecret) {
    return res.status(500).json({
      error: "Server is missing API_KEY or EXTENSION_SECRET environment variables"
    });
  }

  const providedSecret = String(req.headers["x-extension-secret"] || "").trim();
  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (_error) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  try {
    const upstream = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    return res.send(responseText);
  } catch (error) {
    return res.status(502).json({
      error: "Failed to reach AI upstream",
      detail: error?.message || "Unknown upstream error"
    });
  }
};
