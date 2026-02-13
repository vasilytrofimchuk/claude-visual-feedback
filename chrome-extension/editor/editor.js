const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9823;
const MAX_WIDTH = 1440;
const STROKE_COLOR = "#ff3333";
const STROKE_WIDTH = 3;
const POLL_INTERVAL = 2000;

class AnnotationEditor {
  constructor() {
    this.screenshotCanvas = document.getElementById("screenshotCanvas");
    this.annotationCanvas = document.getElementById("annotationCanvas");
    this.screenshotCtx = this.screenshotCanvas.getContext("2d");
    this.annotationCtx = this.annotationCanvas.getContext("2d");

    this.strokes = [];
    this.currentStroke = null;
    this.isDrawing = false;
    this.captureData = null;
    this.currentFeedbackId = null;
    this.pollTimer = null;
    this.serverUrl = "";

    this.init();
  }

  async init() {
    const settings = await chrome.storage.sync.get({ host: DEFAULT_HOST, port: DEFAULT_PORT });
    this.serverUrl = `http://${settings.host}:${settings.port}`;

    // Load project name
    try {
      const res = await fetch(`${this.serverUrl}/health`);
      const data = await res.json();
      document.getElementById("projectLabel").textContent = data.projectName || "Visual Feedback";
    } catch {}

    const { pendingCapture } = await chrome.storage.local.get("pendingCapture");
    if (!pendingCapture) {
      document.body.innerHTML = '<p style="padding:40px;text-align:center;color:#888">No screenshot. Use the extension popup to capture first.</p>';
      return;
    }

    this.captureData = pendingCapture;
    await this.loadScreenshot(pendingCapture.dataUrl);
    this.setupEvents();
  }

  async loadScreenshot(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > MAX_WIDTH) {
          const ratio = MAX_WIDTH / w;
          w = MAX_WIDTH;
          h = Math.round(h * ratio);
        }
        this.screenshotCanvas.width = w;
        this.screenshotCanvas.height = h;
        this.annotationCanvas.width = w;
        this.annotationCanvas.height = h;
        this.screenshotCtx.drawImage(img, 0, 0, w, h);
        resolve();
      };
      img.src = dataUrl;
    });
  }

  setupEvents() {
    const canvas = this.annotationCanvas;
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", () => this.onPointerUp());
    canvas.addEventListener("pointerleave", () => this.onPointerUp());

    document.getElementById("undoBtn").addEventListener("click", () => this.undo());
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        this.undo();
      }
    });

    document.getElementById("instructions").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.send();
      }
    });

    document.getElementById("sendBtn").addEventListener("click", () => this.send());
    document.getElementById("recaptureBtn").addEventListener("click", () => this.recapture());
  }

  // ---- Drawing ----

  getCoords(e) {
    const rect = this.annotationCanvas.getBoundingClientRect();
    const scaleX = this.annotationCanvas.width / rect.width;
    const scaleY = this.annotationCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  onPointerDown(e) {
    this.isDrawing = true;
    const pt = this.getCoords(e);
    this.currentStroke = [pt];
    this.annotationCanvas.setPointerCapture(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.isDrawing || !this.currentStroke) return;
    this.currentStroke.push(this.getCoords(e));
    this.redraw();
  }

  onPointerUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    if (this.currentStroke && this.currentStroke.length > 1) {
      this.strokes.push(this.currentStroke);
    }
    this.currentStroke = null;
    this.redraw();
  }

  drawStroke(ctx, points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  redraw() {
    const ctx = this.annotationCtx;
    ctx.clearRect(0, 0, this.annotationCanvas.width, this.annotationCanvas.height);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of this.strokes) this.drawStroke(ctx, stroke);
    if (this.currentStroke) this.drawStroke(ctx, this.currentStroke);
  }

  undo() {
    this.strokes.pop();
    this.redraw();
  }

  exportComposite() {
    const canvas = document.createElement("canvas");
    canvas.width = this.screenshotCanvas.width;
    canvas.height = this.screenshotCanvas.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(this.screenshotCanvas, 0, 0);
    ctx.drawImage(this.annotationCanvas, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }

  // ---- Chat ----

  addMessage(type, html) {
    const emptyState = document.getElementById("emptyState");
    if (emptyState) emptyState.remove();

    const messages = document.getElementById("chatMessages");
    const msg = document.createElement("div");
    msg.className = `msg ${type}`;
    msg.innerHTML = html;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  // ---- Send ----

  async send() {
    const sendBtn = document.getElementById("sendBtn");
    const input = document.getElementById("instructions");
    sendBtn.disabled = true;

    const instructions = input.value.trim();
    const annotatedScreenshot = this.exportComposite();

    // Add user message to chat
    const thumbDataUrl = this.screenshotCanvas.toDataURL("image/jpeg", 0.3);
    const userText = instructions || "Fix the circled issues";
    this.addMessage("user", `<img class="thumb" src="${thumbDataUrl}" />${this._esc(userText)}`);
    input.value = "";

    // Show waiting overlay on screenshot
    document.getElementById("waitingOverlay").classList.remove("hidden");
    this.annotationCanvas.style.display = "none";

    try {
      const res = await fetch(`${this.serverUrl}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: this.captureData.pageUrl,
          pageTitle: this.captureData.pageTitle,
          annotatedScreenshot,
          instructions,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        this.currentFeedbackId = data.id;
        this.addMessage("system", "Sent to Claude. Waiting for response...");
        this.startPolling(data.id);
      } else {
        throw new Error(data.error || "Server error");
      }
    } catch (err) {
      this.addMessage("system", `Error: ${err.message}`);
      document.getElementById("waitingOverlay").classList.add("hidden");
      this.annotationCanvas.style.display = "";
      sendBtn.disabled = false;
    }
  }

  // ---- Polling ----

  startPolling(feedbackId) {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.poll(feedbackId), POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async poll(feedbackId) {
    try {
      const res = await fetch(`${this.serverUrl}/feedback/${feedbackId}`);
      const data = await res.json();

      if (data.status === "processing") {
        document.querySelector(".waiting-text").textContent = "Claude is working on it...";
      }

      if (data.status === "done") {
        this.stopPolling();
        this.onClaudeResponse(data.response);
      }
    } catch {
      // Server might have restarted, keep polling
    }
  }

  onClaudeResponse(response) {
    // Show response in chat
    this.addMessage("claude", this._esc(response));
    this.addMessage("system", '<span class="refresh-link" id="refreshPage">Refresh page to see changes</span>');

    // Bind refresh handler
    document.getElementById("refreshPage").addEventListener("click", () => this.refreshOriginalPage());

    // Update waiting overlay
    const overlay = document.getElementById("waitingOverlay");
    overlay.querySelector(".spinner").style.display = "none";
    overlay.querySelector(".waiting-text").textContent = "Done!";
    document.getElementById("recaptureBtn").classList.remove("hidden");

    // Enable sending again for follow-up
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("instructions").placeholder = "Follow up...";
  }

  // ---- Page refresh & recapture ----

  refreshOriginalPage() {
    if (this.captureData.tabId) {
      chrome.runtime.sendMessage({ action: "reloadTab", tabId: this.captureData.tabId });
      this.addMessage("system", "Page refreshed.");
    }
  }

  async recapture() {
    if (!this.captureData.tabId) return;

    this.addMessage("system", "Recapturing...");

    const capture = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "captureExistingTab", tabId: this.captureData.tabId },
        resolve
      );
    });

    if (capture?.dataUrl) {
      this.strokes = [];
      this.annotationCanvas.style.display = "";
      document.getElementById("waitingOverlay").classList.add("hidden");
      document.getElementById("recaptureBtn").classList.add("hidden");

      await this.loadScreenshot(capture.dataUrl);
      this.captureData.dataUrl = capture.dataUrl;
      this.redraw();

      this.addMessage("system", "New screenshot loaded. Circle issues and send again.");
      document.getElementById("sendBtn").disabled = false;
      document.getElementById("instructions").placeholder = "What to fix? (optional)";
    } else {
      this.addMessage("system", "Failed to recapture. Try switching to the tab first.");
    }
  }

  // ---- Utils ----

  _esc(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

new AnnotationEditor();
