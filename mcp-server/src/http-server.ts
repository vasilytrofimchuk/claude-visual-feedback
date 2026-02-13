import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { store, type FeedbackItem } from "./store.js";

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

export function startHttpBridge(port: number): void {
  const projectName = path.basename(process.cwd());

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, queueSize: store.pendingCount(), projectName }));
      return;
    }

    // Poll for feedback status (extension polls this)
    if (req.method === "GET" && req.url?.startsWith("/feedback/")) {
      const id = req.url.slice("/feedback/".length);
      const item = store.getById(id);
      if (!item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        id: item.id,
        status: item.status,
        response: item.response || null,
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/feedback") {
      let body = "";
      let size = 0;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Payload too large (max 10MB)" }));
          req.destroy();
          return;
        }
        body += chunk;
      });

      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const item: FeedbackItem = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            pageUrl: data.pageUrl || "",
            pageTitle: data.pageTitle || "",
            annotatedScreenshot: data.annotatedScreenshot || "",
            instructions: data.instructions || "",
            status: "pending",
          };
          store.add(item);
          console.error(`[HTTP] Received feedback ${item.id.slice(0, 8)} (pending: ${store.pendingCount()})`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, id: item.id, queueSize: store.pendingCount() }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, "127.0.0.1", () => {
    console.error(`[HTTP] Visual feedback bridge on http://127.0.0.1:${port}`);
  });
}
