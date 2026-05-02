export type Unsubscribe = () => void;

export function removeFrom<T>(items: T[], item: T) {
  const index = items.indexOf(item);
  if (index !== -1) items.splice(index, 1);
}

export function emit<T>(listeners: readonly ((event: T) => void)[], event: T) {
  for (const listener of [...listeners]) listener(event);
}

export class ListenerList<T> {
  private readonly listeners: ((event: T) => void)[] = [];

  add(callback: (event: T) => void): Unsubscribe {
    this.listeners.push(callback);
    return () => removeFrom(this.listeners, callback);
  }

  emit(event: T) {
    emit(this.listeners, event);
  }

  clear() {
    this.listeners.length = 0;
  }
}

export class FilteredListeners<K, T> {
  private readonly listeners = new Map<K, ((event: T) => void)[]>();

  add(key: K, callback: (event: T) => void): Unsubscribe {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    const list = this.listeners.get(key)!;
    list.push(callback);
    return () => removeFrom(list, callback);
  }

  emit(key: K, event: T) {
    const list = this.listeners.get(key);
    if (list) emit(list, event);
  }

  clear(key: K) {
    this.listeners.delete(key);
  }
}
