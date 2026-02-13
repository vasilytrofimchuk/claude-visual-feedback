import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { store } from "./store.js";

export function registerTools(server: McpServer): void {
  server.tool(
    "get_visual_feedback",
    "Get the next visual feedback item. Returns an annotated screenshot with circled issues and optional text instructions. Call this when the user says to fix visual issues or check feedback.",
    {},
    async () => {
      const item = store.getNextPending();
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
          `**Feedback ID:** ${item.id}`,
          `**Instructions:** ${instructions}`,
          `**Remaining pending:** ${store.pendingCount()}`,
          ``,
          `When you're done fixing, call respond_visual_feedback with a summary of what you changed.`,
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
    "respond_visual_feedback",
    "Send a response back to the user after fixing visual issues. The Chrome extension will display your message and optionally refresh the page. Call this after you've made the fixes.",
    {
      message: z.string().describe("Summary of what you fixed, e.g. 'Fixed header spacing and button color'"),
    },
    async ({ message }) => {
      const item = store.respond(message);
      if (!item) {
        return {
          content: [{ type: "text" as const, text: "No feedback item is currently being processed." }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Response sent to Chrome extension for feedback ${item.id.slice(0, 8)}. The user will see: "${message}"`,
        }],
      };
    }
  );

  server.tool(
    "list_visual_feedback",
    "List all visual feedback items with their status. Returns summaries only, no screenshots.",
    {},
    async () => {
      const items = store.getAll();
      if (items.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No visual feedback items." }],
        };
      }

      const summary = items
        .map((item, i) => {
          const instr = item.instructions
            ? item.instructions.slice(0, 80) + (item.instructions.length > 80 ? "..." : "")
            : "(no text)";
          return `${i + 1}. [${item.status}] ${item.pageTitle} — ${instr}`;
        })
        .join("\n");

      return {
        content: [{ type: "text" as const, text: `**Feedback Items (${items.length})**\n\n${summary}` }],
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
