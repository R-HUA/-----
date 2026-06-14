import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonStore {
  constructor(dataFile) {
    this.dataFile = dataFile;
    this.records = new Map();
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true });

    try {
      const raw = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(raw);
      for (const record of parsed.records ?? []) {
        this.records.set(record.id, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      await this.flush();
    }
  }

  list() {
    return [...this.records.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  pending() {
    return this.list().filter((record) => record.status === 'pending_review');
  }

  get(id) {
    return this.records.get(id) ?? null;
  }

  async create(record) {
    this.records.set(record.id, record);
    await this.flush();
    return record;
  }

  async update(id, updater) {
    const existing = this.get(id);
    if (!existing) {
      return null;
    }

    const updated = typeof updater === 'function' ? updater(structuredClone(existing)) : { ...existing, ...updater };
    updated.updatedAt = new Date().toISOString();
    this.records.set(id, updated);
    await this.flush();
    return updated;
  }

  async flush() {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
        const tmp = `${this.dataFile}.${process.pid}.tmp`;
        const payload = JSON.stringify({ records: this.list() }, null, 2);
        await fs.writeFile(tmp, payload);
        await fs.rename(tmp, this.dataFile);
      });

    return this.writeQueue;
  }
}
