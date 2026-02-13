export interface FeedbackItem {
  id: string;
  timestamp: string;
  pageUrl: string;
  pageTitle: string;
  annotatedScreenshot: string; // base64 PNG
  instructions: string;
}

class FeedbackStore {
  private items: FeedbackItem[] = [];

  add(item: FeedbackItem): void {
    this.items.push(item);
  }

  getAll(): FeedbackItem[] {
    return [...this.items];
  }

  getNext(): FeedbackItem | undefined {
    return this.items.shift();
  }

  count(): number {
    return this.items.length;
  }

  clear(): number {
    const count = this.items.length;
    this.items = [];
    return count;
  }
}

export const store = new FeedbackStore();
