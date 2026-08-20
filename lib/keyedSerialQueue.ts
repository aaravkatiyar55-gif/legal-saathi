export class KeyedSerialQueue {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.pending.set(key, current);
    void current.finally(() => {
      if (this.pending.get(key) === current) this.pending.delete(key);
    }).catch(() => undefined);
    return current;
  }

  async drain() {
    await Promise.allSettled([...this.pending.values()]);
  }
}
