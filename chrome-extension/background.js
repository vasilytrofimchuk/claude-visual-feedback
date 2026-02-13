chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (message.action === "getTabInfo") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      sendResponse({
        url: tab?.url || "",
        title: tab?.title || "",
        tabId: tab?.id || null,
        windowId: tab?.windowId || null,
      });
    });
    return true;
  }

  if (message.action === "reloadTab") {
    if (message.tabId) {
      chrome.tabs.reload(message.tabId);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "captureExistingTab") {
    // Capture a specific tab (for recapture)
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
});
