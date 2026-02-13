# Claude Visual Feedback

Capture screenshots, circle issues, and send them directly to Claude Code via MCP. Claude sees your annotated screenshot and fixes the visual problems automatically.

## How It Works

1. Click the Chrome extension icon → captures the current tab
2. Circle the issues on the screenshot (freehand drawing)
3. Optionally type what needs fixing
4. Press Enter → screenshot is sent to Claude Code via MCP
5. Tell Claude "fix the visual issues" → Claude calls `get_visual_feedback` and sees your annotated screenshot

## Setup

### 1. MCP Server

Add to your project's `.mcp.json`:

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

Or run locally from source:

```json
{
  "mcpServers": {
    "visual-feedback": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/claude-visual-feedback/mcp-server/src/index.ts"]
    }
  }
}
```

Restart Claude Code to pick up the MCP server.

### 2. Chrome Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_visual_feedback` | Get the next annotated screenshot + instructions |
| `list_visual_feedback` | List all queued feedback items |
| `clear_visual_feedback` | Clear the feedback queue |

## Configuration

Click the extension icon → right-click → **Options** to configure:

- **Server Host** (default: `127.0.0.1`)
- **Server Port** (default: `9823`)

## Development

```bash
# MCP Server
cd mcp-server
npm install
npm run build    # Compile TypeScript
npm run dev      # Run with tsx (no build needed)

# Chrome Extension
# Load unpacked from chrome://extensions
```
