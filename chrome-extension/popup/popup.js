const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9823;

async function getServerUrl() {
  const settings = await chrome.storage.sync.get({ host: DEFAULT_HOST, port: DEFAULT_PORT });
  return `http://${settings.host}:${settings.port}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const captureBtn = document.getElementById("captureBtn");
  const serverStatus = document.getElementById("serverStatus");
  const projectName = document.getElementById("projectName");
  const statusLabel = serverStatus.querySelector(".label");

  const serverUrl = await getServerUrl();

  // Check server health
  try {
    const res = await fetch(`${serverUrl}/health`);
    const data = await res.json();
    serverStatus.classList.add("connected");
    statusLabel.textContent = `Connected (${data.queueSize} queued)`;
    projectName.textContent = `Project: ${data.projectName}`;
    captureBtn.disabled = false;
  } catch {
    serverStatus.classList.add("disconnected");
    statusLabel.textContent = "Server not running";
    projectName.textContent = "Start Claude Code with visual-feedback MCP";
  }

  captureBtn.addEventListener("click", async () => {
    captureBtn.disabled = true;
    captureBtn.textContent = "Capturing...";

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Capture screenshot
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

      // Store data for editor
      await chrome.storage.local.set({
        pendingCapture: {
          dataUrl,
          pageUrl: tab.url || "",
          pageTitle: tab.title || "",
          tabId: tab.id,
        },
      });

      // Inject sidebar directly into the page (no new tab/window)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Remove existing sidebar
          const old = document.getElementById("vf-sidebar");
          if (old) old.remove();

          // Create sidebar container
          const sidebar = document.createElement("div");
          sidebar.id = "vf-sidebar";
          sidebar.style.cssText =
            "position:fixed;top:0;right:0;width:450px;height:100vh;" +
            "z-index:2147483647;box-shadow:-4px 0 20px rgba(0,0,0,0.4);";

          const iframe = document.createElement("iframe");
          iframe.src = chrome.runtime.getURL("editor/editor.html");
          iframe.style.cssText = "width:100%;height:100%;border:none;";
          sidebar.appendChild(iframe);

          document.body.appendChild(sidebar);

          // Push page content left
          document.documentElement.style.marginRight = "450px";
          document.documentElement.style.transition = "margin-right 0.15s";

          // Listen for close message from editor iframe
          window.addEventListener("message", function handler(e) {
            if (e.data?.type === "vf-close") {
              sidebar.remove();
              document.documentElement.style.marginRight = "";
              window.removeEventListener("message", handler);
            }
          });
        },
      });

      window.close();
    } catch (err) {
      captureBtn.textContent = `Error: ${err.message}`;
      captureBtn.disabled = false;
    }
  });
});
