document.addEventListener("DOMContentLoaded", async () => {
  const hostInput = document.getElementById("host");
  const portInput = document.getElementById("port");
  const saveBtn = document.getElementById("saveBtn");
  const savedMsg = document.getElementById("savedMsg");

  // Load saved settings
  const settings = await chrome.storage.sync.get({ host: "127.0.0.1", port: 9823 });
  hostInput.value = settings.host;
  portInput.value = settings.port;

  saveBtn.addEventListener("click", async () => {
    await chrome.storage.sync.set({
      host: hostInput.value.trim() || "127.0.0.1",
      port: parseInt(portInput.value, 10) || 9823,
    });
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });
});
