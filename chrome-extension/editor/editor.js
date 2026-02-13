const MAX_WIDTH = 2880;
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
    this.pendingIds = new Set();
    this.pollTimer = null;

    this.setupEvents();
    this.init().catch((err) => console.error("[VF] init error:", err));
  }

  async init() {
    try {
      const data = await this.bgMessage({ action: "healthCheck" });
      document.getElementById("projectLabel").textContent = data.projectName || "Visual Feedback";
    } catch {}

    const { pendingCapture } = await chrome.storage.local.get("pendingCapture");
    if (!pendingCapture) {
      document.getElementById("screenshotArea").innerHTML =
        '<p style="padding:16px;text-align:center;color:#555;font-size:12px">No screenshot captured.</p>';
      return;
    }

    this.captureData = pendingCapture;
    await this.loadScreenshot(pendingCapture.dataUrl);
    this.enterDrawMode();
  }

  async loadScreenshot(dataUrl) {
    return new Promise((resolve, reject) => {
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
      img.onerror = () => reject(new Error("Failed to load screenshot"));
      img.src = dataUrl;
    });
  }

  setupEvents() {
    const canvas = this.annotationCanvas;

    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onPointerDown(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      e.preventDefault();
      this.onPointerMove(e);
    });
    canvas.addEventListener("pointerup", (e) => {
      e.preventDefault();
      this.onPointerUp();
    });
    canvas.addEventListener("pointerleave", () => this.onPointerUp());

    // Close — tell parent page to remove the sidebar iframe
    document.getElementById("closeBtn").addEventListener("click", () => {
      window.parent.postMessage({ type: "vf-close" }, "*");
    });

    document.getElementById("undoBtn").addEventListener("click", () => this.undo());
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        this.undo();
      }
    });

    // New screenshot button
    document.getElementById("newScreenshotBtn").addEventListener("click", () => this.newScreenshot());

    document.getElementById("instructions").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.send();
      }
    });
    document.getElementById("sendBtn").addEventListener("click", () => this.send());
  }

  // ---- Draw mode (expand/collapse) ----

  enterDrawMode() {
    document.body.classList.add("draw-mode");
    document.getElementById("screenshotArea").classList.remove("hidden");
    window.parent.postMessage({ type: "vf-expand" }, "*");
  }

  exitDrawMode() {
    document.body.classList.remove("draw-mode");
    window.parent.postMessage({ type: "vf-collapse" }, "*");
  }

  // ---- Drawing ----

  getCoords(e) {
    const rect = this.annotationCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
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

  // ---- New Screenshot ----

  async newScreenshot() {
    if (!this.captureData?.tabId) return;

    this.addMessage("system", "Recapturing...");

    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "recaptureTab", tabId: this.captureData.tabId },
        resolve
      );
    });

    if (result?.dataUrl) {
      this.strokes = [];
      await this.loadScreenshot(result.dataUrl);
      this.captureData.dataUrl = result.dataUrl;
      this.redraw();

      this.enterDrawMode();
      this.addMessage("system", "New screenshot. Circle and send.");
      document.getElementById("sendBtn").disabled = false;
      document.getElementById("instructions").placeholder = "What to fix? (optional)";
    } else {
      this.addMessage("system", "Failed to recapture.");
    }
  }

  // ---- Send ----

  async send() {
    if (!this.captureData) return;
    const sendBtn = document.getElementById("sendBtn");
    const input = document.getElementById("instructions");
    sendBtn.disabled = true;

    const instructions = input.value.trim();
    const annotatedScreenshot = this.exportComposite();

    const thumbDataUrl = this.screenshotCanvas.toDataURL("image/jpeg", 0.5);
    const userText = instructions || "Fix the circled issues";
    this.addMessage("user", `<img class="thumb" src="${thumbDataUrl}" />${this._esc(userText)}`);
    input.value = "";

    // Collapse to sidebar, hide screenshot
    document.getElementById("screenshotArea").classList.add("hidden");
    this.exitDrawMode();

    try {
      const data = await this.bgMessage({
        action: "sendFeedback",
        payload: {
          pageUrl: this.captureData.pageUrl,
          pageTitle: this.captureData.pageTitle,
          annotatedScreenshot,
          instructions,
        },
      });

      if (data.ok) {
        this.addMessage("system", `Queued (#${this.pendingIds.size + 1})`);
        this.pendingIds.add(data.id);
        this.ensurePolling();
        // Re-enable immediately so user can send more
        sendBtn.disabled = false;
        this.showNewScreenshotButton();
      } else {
        throw new Error(data.error || "Server error");
      }
    } catch (err) {
      this.addMessage("system", `Error: ${err.message}`);
      sendBtn.disabled = false;
    }
  }

  // ---- Polling (handles multiple pending items) ----

  ensurePolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollAll(), POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async pollAll() {
    if (this.pendingIds.size === 0) {
      this.stopPolling();
      return;
    }

    for (const feedbackId of this.pendingIds) {
      try {
        const data = await this.bgMessage({ action: "pollFeedback", feedbackId });
        if (data.status === "done") {
          this.pendingIds.delete(feedbackId);
          this.onClaudeResponse(data.response);
        }
      } catch {}
    }

    if (this.pendingIds.size === 0) {
      this.stopPolling();
    }
  }

  showNewScreenshotButton() {
    // Remove existing big button if any
    const existing = document.querySelector(".new-screenshot-big");
    if (existing) existing.remove();

    const messages = document.getElementById("chatMessages");
    const btn = document.createElement("button");
    btn.className = "new-screenshot-big";
    btn.textContent = "New Screenshot";
    btn.addEventListener("click", () => {
      btn.remove();
      this.newScreenshot();
    });
    messages.appendChild(btn);
    messages.scrollTop = messages.scrollHeight;
  }

  onClaudeResponse(response) {
    this.addMessage("claude", this._esc(response));
    this.addMessage("system",
      '<span class="refresh-link" id="refreshPage">Refresh page</span>'
    );

    document.getElementById("refreshPage").addEventListener("click", () => this.refreshAndReopen());
    this.showNewScreenshotButton();

    document.getElementById("sendBtn").disabled = false;
    document.getElementById("instructions").placeholder = "Follow up...";
  }

  // Refresh page and re-inject sidebar with fresh screenshot
  refreshAndReopen() {
    if (!this.captureData?.tabId) return;
    this.addMessage("system", "Refreshing page...");

    chrome.runtime.sendMessage({
      action: "refreshAndReopen",
      tabId: this.captureData.tabId,
    });
  }

  // Route all HTTP requests through background service worker (with retry)
  bgMessage(msg, retries = 1) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          if (retries > 0) {
            // Service worker may have gone inactive — retry once
            setTimeout(() => this.bgMessage(msg, 0).then(resolve, reject), 500);
          } else {
            reject(new Error(chrome.runtime.lastError.message));
          }
        } else if (response === undefined) {
          if (retries > 0) {
            setTimeout(() => this.bgMessage(msg, 0).then(resolve, reject), 500);
          } else {
            reject(new Error("No response from extension. Try again."));
          }
        } else {
          resolve(response);
        }
      });
    });
  }

  _esc(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

new AnnotationEditor();
