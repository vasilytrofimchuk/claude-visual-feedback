export type FeedbackStatus = "pending" | "processing" | "done";

export interface FeedbackItem {
  id: string;
  timestamp: string;
  pageUrl: string;
  pageTitle: string;
  annotatedScreenshot: string;
  instructions: string;
  status: FeedbackStatus;
  response?: string;
}

class FeedbackStore {
  private items: Map<string, FeedbackItem> = new Map();

  add(item: FeedbackItem): void {
    this.items.set(item.id, item);
  }

  getById(id: string): FeedbackItem | undefined {
    return this.items.get(id);
  }

  getNextPending(): FeedbackItem | undefined {
    for (const item of this.items.values()) {
      if (item.status === "pending") {
        item.status = "processing";
        return item;
      }
    }
    return undefined;
  }

  respond(message: string): FeedbackItem | undefined {
    for (const item of this.items.values()) {
      if (item.status === "processing") {
        item.status = "done";
        item.response = message;
        return item;
      }
    }
    return undefined;
  }

  pendingCount(): number {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.status === "pending") count++;
    }
    return count;
  }

  totalCount(): number {
    return this.items.size;
  }

  clear(): number {
    const count = this.items.size;
    this.items.clear();
    return count;
  }

  getAll(): FeedbackItem[] {
    return [...this.items.values()];
  }
}

export const store = new FeedbackStore();
