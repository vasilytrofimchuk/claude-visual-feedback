# Claude Visual Feedback

Capture screenshots, circle issues, and send them directly to Claude Code via MCP. Claude sees your annotated screenshot and fixes the visual problems automatically.

## How It Works

1. Click the Chrome extension icon — captures the current tab as a screenshot
2. Circle the issues on the screenshot (freehand drawing in an expandable overlay)
3. Optionally type instructions describing what needs fixing
4. Press Enter — screenshot is queued and sent to Claude Code via MCP
5. Claude automatically calls `get_visual_feedback`, sees your annotated screenshot, and fixes the code

You can stack multiple screenshots without waiting — each one is queued and processed in order.

## Full Setup

### 1. Clone the repo

```bash
git clone https://github.com/vasilytrofimchuk/claude-visual-feedback.git
cd claude-visual-feedback
```

### 2. Install and build the MCP server

```bash
cd mcp-server
npm install
npm run build
```

### 3. Register the MCP server in your project

Add to your project's `.mcp.json` (create it in the project root if it doesn't exist):

**From source (development):**

```json
{
  "mcpServers": {
    "visual-feedback": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/claude-visual-feedback/mcp-server/src/index.ts"]
    }
  }
}
```

**From npm (when published):**

```json
{
  "mcpServers": {
    "visual-feedback": {
      "type": "stdio",
      "command": "npx",
      "args": ["claude-visual-feedback"]
    }
  }
}
```

### 4. Install the Chrome extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory from this repo

### 5. Auto-approve MCP tools (recommended)

Add the tool permissions to your project's `.claude/settings.local.json` so Claude doesn't ask for approval every time:

```json
{
  "permissions": {
    "allow": [
      "mcp__visual-feedback__get_visual_feedback",
      "mcp__visual-feedback__respond_visual_feedback",
      "mcp__visual-feedback__list_visual_feedback",
      "mcp__visual-feedback__clear_visual_feedback"
    ]
  }
}
```

### 6. Restart Claude Code

Restart Claude Code (or reload the window in VSCode) to pick up the MCP server configuration.

### 7. Grant accessibility permissions (macOS, for auto-nudge)

The MCP server auto-types "fix" into Claude Code when feedback arrives. This requires macOS accessibility permissions:

1. Open **System Settings > Privacy & Security > Accessibility**
2. Add and enable **Terminal** (or **iTerm**, or **Visual Studio Code** — whichever app runs Claude Code)

## Usage

1. Navigate to the page you want to fix in Chrome
2. Click the extension icon — a sidebar appears with a screenshot
3. Click the screenshot to enter draw mode (expands to full overlay)
4. Circle the issues with your mouse
5. Type instructions in the text field (optional)
6. Press Enter or click Send
7. Claude Code receives the feedback and fixes the code automatically

**Stacking:** You can send multiple screenshots in a row. Each one is queued — no need to wait for Claude to finish the previous one.

**New Screenshot:** After sending, click the "New Screenshot" button to capture a fresh screenshot without closing the sidebar.

**Refresh:** Click the refresh link after Claude responds to reload the page and verify the fix, keeping the sidebar open.

## Auto-Nudge (Zero-Input Automation)

The entire flow is hands-free. When feedback arrives, the MCP server automatically focuses VSCode and types "fix" into Claude Code's input (after a 3-second debounce to let you stack screenshots). Claude then processes all pending feedback — no need to type anything or switch to the editor.

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VF_AUTO_NUDGE` | `1` (on) | Set to `0` to disable auto-nudge |

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_visual_feedback` | Get the next annotated screenshot + instructions |
| `respond_visual_feedback` | Send a response summary back to the Chrome extension |
| `list_visual_feedback` | List all queued feedback items with status |
| `clear_visual_feedback` | Clear the feedback queue |

## Configuration

Right-click the extension icon → **Options** to configure:

- **Server Host** (default: `127.0.0.1`)
- **Server Port** (default: `9823`)

## Architecture

```
Chrome Extension ──HTTP POST──▶ MCP Server (port 9823) ──stdio──▶ Claude Code
     │                              │                                  │
     │  annotated screenshot        │  stores in memory queue          │  calls get_visual_feedback
     │  + instructions              │  auto-nudges VSCode              │  sees screenshot + instructions
     │                              │                                  │  fixes code
     ◀──────── polls GET ───────────│◀────── respond_visual_feedback ──│
     │  shows Claude's response     │  marks item done                 │
```

## Development

```bash
# MCP Server
cd mcp-server
npm install
npm run build    # Compile TypeScript → build/
npm run dev      # Run with tsx (no build needed)

# Chrome Extension — no build step
# Just reload at chrome://extensions after changes
```

## License

MIT
