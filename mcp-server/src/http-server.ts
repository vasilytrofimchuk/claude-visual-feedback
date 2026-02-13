import http from "node:http";
import { exec, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { store, type FeedbackItem } from "./store.js";

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const NUDGE_DELAY = 3000; // Wait 3s for user to stack more screenshots

let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

function nudgeClaude(): void {
  // Debounce — reset timer on each new feedback so user can stack multiple
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    // Use osascript to type "fix" into VSCode Claude Code input
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
      end tell
      tell application "Visual Studio Code" to activate
      delay 0.5
      tell application "System Events"
        keystroke "l" using command down
        delay 0.3
        keystroke "fix"
        delay 0.1
        key code 36
      end tell
      -- Restore previous app if it wasn't VSCode
      if frontApp is not "Code" then
        delay 0.5
        tell application frontApp to activate
      end if
    `;
    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (err) => {
      if (err) {
        console.error(`[HTTP] Nudge failed: ${err.message}`);
      } else {
        console.error("[HTTP] Nudged Claude Code with 'fix'");
      }
    });
  }, NUDGE_DELAY);
}

function killPortHolder(port: number): void {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    if (pids) {
      execSync(`kill ${pids.split("\n").join(" ")}`);
      console.error(`[HTTP] Killed old process(es) on port ${port}`);
    }
  } catch {
    // Nothing on the port — good
  }
}

export function startHttpBridge(port: number): void {
  const projectName = path.basename(process.cwd());
  const autoNudge = process.env.VF_AUTO_NUDGE !== "0"; // enabled by default

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

          // Auto-nudge Claude Code
          if (autoNudge) nudgeClaude();
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

  let retried = false;

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && !retried) {
      retried = true;
      killPortHolder(port);
      setTimeout(() => server.listen(port, "127.0.0.1"), 500);
    } else if (err.code === "EADDRINUSE") {
      console.error(`[HTTP] Port ${port} still in use after retry — stdio MCP still works.`);
    } else {
      console.error(`[HTTP] Server error: ${err.message}`);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.error(`[HTTP] Visual feedback bridge on http://127.0.0.1:${port} (auto-nudge: ${autoNudge ? "on" : "off"})`);
  });
}
