import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  return readFile(envPath, "utf8")
    .then((content) => {
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = value;
      }
    })
    .catch(() => {});
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function handleChat(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendJson(res, 500, {
      error: "Server is missing ANTHROPIC_API_KEY in .env"
    });
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });

  req.on("end", async () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const message = String(payload.message || "").trim();
      if (!message) {
        sendJson(res, 400, { error: "message is required" });
        return;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
          max_tokens: 1024,
          messages: [{ role: "user", content: message }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        sendJson(res, 502, {
          error: "Anthropic request failed",
          details: errorText
        });
        return;
      }

      const data = await response.json();
      const reply = Array.isArray(data.content)
        ? data.content
            .filter((item) => item && item.type === "text" && typeof item.text === "string")
            .map((item) => item.text)
            .join("\n")
            .trim()
        : "";
      sendJson(res, 200, { reply: reply || "No response text returned." });
    } catch (err) {
      sendJson(res, 500, {
        error: "Unexpected server error",
        details: err instanceof Error ? err.message : String(err)
      });
    }
  });
}

await loadEnvFile();

const port = Number(process.env.PORT || 3000);
const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`AI website running at http://localhost:${port}`);
});
