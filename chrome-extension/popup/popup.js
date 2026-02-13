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

    // Get tab info
    const tabInfo = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getTabInfo" }, resolve);
    });

    // Capture screenshot
    const capture = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "captureTab" }, resolve);
    });

    if (capture.error) {
      captureBtn.textContent = `Error: ${capture.error}`;
      captureBtn.disabled = false;
      return;
    }

    // Store data for editor tab
    await chrome.storage.local.set({
      pendingCapture: {
        dataUrl: capture.dataUrl,
        pageUrl: tabInfo.url,
        pageTitle: tabInfo.title,
      },
    });

    // Open editor
    chrome.tabs.create({ url: chrome.runtime.getURL("editor/editor.html") });
    window.close();
  });
});
