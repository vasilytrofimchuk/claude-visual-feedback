const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9823;

async function getServerUrl() {
  const settings = await chrome.storage.sync.get({ host: DEFAULT_HOST, port: DEFAULT_PORT });
  return `http://${settings.host}:${settings.port}`;
}

// Capture screenshot and inject sidebar into the active tab
async function captureAndInject(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

    await chrome.storage.local.set({
      pendingCapture: {
        dataUrl,
        pageUrl: tab.url || "",
        pageTitle: tab.title || "",
        tabId: tab.id,
      },
    });

    await injectSidebar(tab.id);
  } catch (err) {
    console.error("[VF] captureAndInject error:", err);
  }
}

// Inject or re-inject the sidebar iframe into a tab
async function injectSidebar(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (editorUrl) => {
      // Remove existing sidebar
      const old = document.getElementById("vf-sidebar");
      if (old) old.remove();

      const sidebar = document.createElement("div");
      sidebar.id = "vf-sidebar";
      sidebar.style.cssText =
        "position:fixed;top:0;right:0;width:450px;height:100vh;" +
        "z-index:2147483647;box-shadow:-4px 0 20px rgba(0,0,0,0.4);";

      const iframe = document.createElement("iframe");
      iframe.src = editorUrl;
      iframe.style.cssText = "width:100%;height:100%;border:none;";
      sidebar.appendChild(iframe);

      document.body.appendChild(sidebar);

      document.documentElement.style.marginRight = "450px";
      document.documentElement.style.transition = "margin-right 0.15s";

      // Listen for messages from editor iframe
      window.addEventListener("message", function handler(e) {
        if (e.data?.type === "vf-close") {
          sidebar.remove();
          document.documentElement.style.marginRight = "";
          window.removeEventListener("message", handler);
        } else if (e.data?.type === "vf-hide") {
          sidebar.style.display = "none";
          document.documentElement.style.marginRight = "";
        } else if (e.data?.type === "vf-show") {
          sidebar.style.display = "";
          document.documentElement.style.marginRight = "450px";
        }
      });
    },
    args: [chrome.runtime.getURL("editor/editor.html")],
  });
}

// Extension icon clicked — capture + inject sidebar
chrome.action.onClicked.addListener(async (tab) => {
  await captureAndInject(tab);
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "reloadTab") {
    if (message.tabId) {
      chrome.tabs.reload(message.tabId);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "captureExistingTab") {
    if (message.tabId) {
      chrome.tabs.update(message.tabId, { active: true }, () => {
        setTimeout(() => {
          chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
            }
            sendResponse({ dataUrl });
          });
        }, 300);
      });
    }
    return true;
  }

  // Refresh the page and re-inject sidebar with fresh screenshot
  if (message.action === "refreshAndReopen") {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ error: "No tabId" });
      return true;
    }

    chrome.tabs.reload(tabId, {}, () => {
      // Wait for page to load
      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          // Small delay for rendering
          setTimeout(async () => {
            try {
              const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
              const tab = await chrome.tabs.get(tabId);

              await chrome.storage.local.set({
                pendingCapture: {
                  dataUrl,
                  pageUrl: tab.url || "",
                  pageTitle: tab.title || "",
                  tabId: tab.id,
                },
              });

              await injectSidebar(tabId);
              sendResponse({ ok: true });
            } catch (err) {
              sendResponse({ error: err.message });
            }
          }, 500);
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
    return true;
  }

  // Recapture without refresh — hide sidebar, capture, show sidebar
  if (message.action === "recaptureTab") {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ error: "No tabId" });
      return true;
    }

    // Tell page to hide sidebar temporarily
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sidebar = document.getElementById("vf-sidebar");
        if (sidebar) sidebar.style.display = "none";
        document.documentElement.style.marginRight = "";
      },
    }).then(() => {
      // Wait for sidebar to hide
      setTimeout(async () => {
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

          // Update storage
          const { pendingCapture } = await chrome.storage.local.get("pendingCapture");
          await chrome.storage.local.set({
            pendingCapture: {
              ...pendingCapture,
              dataUrl,
              tabId,
            },
          });

          // Show sidebar again
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const sidebar = document.getElementById("vf-sidebar");
              if (sidebar) sidebar.style.display = "";
              document.documentElement.style.marginRight = "450px";
            },
          });

          sendResponse({ dataUrl });
        } catch (err) {
          // Show sidebar even on error
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const sidebar = document.getElementById("vf-sidebar");
              if (sidebar) sidebar.style.display = "";
              document.documentElement.style.marginRight = "450px";
            },
          });
          sendResponse({ error: err.message });
        }
      }, 200);
    });
    return true;
  }
});
