const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9823;
const MAX_WIDTH = 1440;
const STROKE_COLOR = "#ff3333";
const STROKE_WIDTH = 3;

class AnnotationEditor {
  constructor() {
    this.screenshotCanvas = document.getElementById("screenshotCanvas");
    this.annotationCanvas = document.getElementById("annotationCanvas");
    this.screenshotCtx = this.screenshotCanvas.getContext("2d");
    this.annotationCtx = this.annotationCanvas.getContext("2d");

    this.strokes = []; // Array of point arrays
    this.currentStroke = null;
    this.isDrawing = false;
    this.captureData = null;

    this.init();
  }

  async init() {
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
        // Downscale HiDPI
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

    const instructionsInput = document.getElementById("instructions");
    instructionsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.send();
      }
    });

    document.getElementById("sendBtn").addEventListener("click", () => this.send());
  }

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
    const pt = this.getCoords(e);
    this.currentStroke.push(pt);
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

    for (const stroke of this.strokes) {
      this.drawStroke(ctx, stroke);
    }

    if (this.currentStroke) {
      this.drawStroke(ctx, this.currentStroke);
    }
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

  showStatus(message, type) {
    const el = document.getElementById("status");
    el.textContent = message;
    el.className = `status-msg visible ${type}`;
  }

  async send() {
    const sendBtn = document.getElementById("sendBtn");
    sendBtn.disabled = true;

    const instructions = document.getElementById("instructions").value.trim();
    const annotatedScreenshot = this.exportComposite();

    const settings = await chrome.storage.sync.get({ host: DEFAULT_HOST, port: DEFAULT_PORT });
    const serverUrl = `http://${settings.host}:${settings.port}`;

    try {
      const res = await fetch(`${serverUrl}/feedback`, {
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
        this.showStatus(`Sent! (${data.queueSize} in queue)`, "success");
        await chrome.storage.local.remove("pendingCapture");
        setTimeout(() => window.close(), 1000);
      } else {
        throw new Error(data.error || "Server error");
      }
    } catch (err) {
      this.showStatus(`Error: ${err.message}`, "error");
      sendBtn.disabled = false;
    }
  }
}

new AnnotationEditor();
