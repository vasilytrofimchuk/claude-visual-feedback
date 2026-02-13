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
      // Get active tab directly from popup context (reliable windowId)
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Capture screenshot directly from popup
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

      // Store data for editor tab
      await chrome.storage.local.set({
        pendingCapture: {
          dataUrl,
          pageUrl: tab.url || "",
          pageTitle: tab.title || "",
          tabId: tab.id,
        },
      });

      // Open editor in the SAME window — tab.windowId is reliable from popup context
      chrome.tabs.create({
        url: chrome.runtime.getURL("editor/editor.html"),
        windowId: tab.windowId,
      });
      window.close();
    } catch (err) {
      captureBtn.textContent = `Error: ${err.message}`;
      captureBtn.disabled = false;
    }
  });
});
