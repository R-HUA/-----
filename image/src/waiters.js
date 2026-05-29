export class ApprovalWaiters {
  constructor() {
    this.waiters = new Map();
  }

  wait(id, timeoutMs) {
    return new Promise((resolve) => {
      const entry = { resolve, timer: null };
      if (timeoutMs >= 0) {
        entry.timer = setTimeout(() => {
          this.delete(id, entry);
          resolve({ type: 'timeout' });
        }, timeoutMs);
      }

      const entries = this.waiters.get(id) ?? new Set();
      entries.add(entry);
      this.waiters.set(id, entries);
    });
  }

  notify(id, payload) {
    const entries = this.waiters.get(id);
    if (!entries) {
      return;
    }

    this.waiters.delete(id);
    for (const entry of entries) {
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      entry.resolve(payload);
    }
  }

  delete(id, entry) {
    const entries = this.waiters.get(id);
    if (!entries) {
      return;
    }

    entries.delete(entry);
    if (entries.size === 0) {
      this.waiters.delete(id);
    }
  }
}
