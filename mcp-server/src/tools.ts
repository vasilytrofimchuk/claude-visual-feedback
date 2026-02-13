import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { store } from "./store.js";

export function registerTools(server: McpServer): void {
  server.tool(
    "get_visual_feedback",
    "Get the next visual feedback item. Returns an annotated screenshot with circled issues and optional text instructions. Call this when the user says to fix visual issues or check feedback.",
    {},
    async () => {
      const item = store.getNext();
      if (!item) {
        return {
          content: [{ type: "text" as const, text: "No visual feedback items in the queue." }],
        };
      }

      const instructions = item.instructions || "Fix the circled issues in this screenshot.";

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

      content.push({
        type: "text" as const,
        text: [
          `**Page:** ${item.pageTitle} (${item.pageUrl})`,
          `**Instructions:** ${instructions}`,
          `**Remaining in queue:** ${store.count()}`,
        ].join("\n"),
      });

      if (item.annotatedScreenshot) {
        content.push({
          type: "image" as const,
          data: item.annotatedScreenshot,
          mimeType: "image/png",
        });
      }

      return { content };
    }
  );

  server.tool(
    "list_visual_feedback",
    "List all queued visual feedback items without consuming them. Returns summaries only, no screenshots.",
    {},
    async () => {
      const items = store.getAll();
      if (items.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No visual feedback items in the queue." }],
        };
      }

      const summary = items
        .map((item, i) => {
          const instr = item.instructions
            ? item.instructions.slice(0, 80) + (item.instructions.length > 80 ? "..." : "")
            : "(no text, just annotations)";
          return `${i + 1}. ${item.pageTitle} — ${instr}`;
        })
        .join("\n");

      return {
        content: [{ type: "text" as const, text: `**Visual Feedback Queue (${items.length})**\n\n${summary}` }],
      };
    }
  );

  server.tool(
    "clear_visual_feedback",
    "Clear all visual feedback items from the queue.",
    {},
    async () => {
      const count = store.clear();
      return {
        content: [{ type: "text" as const, text: `Cleared ${count} feedback items.` }],
      };
    }
  );
}
