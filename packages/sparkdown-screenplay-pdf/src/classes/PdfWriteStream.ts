import { stringToUtf8 } from "../utils/stringToUtf8";

export type Listener = (...args: unknown[]) => void;

export default class PdfWriteStream {
  maxListeners = 1000;

  writable = true;

  chunks: Uint8Array[] = [];

  repeatCallbacks: Record<string | symbol, Listener[]> = {};

  onceCallbacks: Record<string | symbol, Listener[]> = {};

  onEnd?: (chunks: Uint8Array[]) => Promise<void>;

  constructor(onEnd?: (chunks: Uint8Array[]) => Promise<void>) {
    this.onEnd = onEnd;
  }

  addListener(eventName: string | symbol, listener: Listener): this {
    if (!this.repeatCallbacks[eventName]) {
      this.repeatCallbacks[eventName] = [];
    }
    this.repeatCallbacks[eventName]?.push(listener);
    return this;
  }

  removeListener(eventName: string | symbol, listener: Listener): this {
    const callbacks = this.repeatCallbacks[eventName];
    if (!callbacks) {
      return this;
    }
    const index = callbacks.indexOf(listener);
    if (index < 0) {
      return this;
    }
    callbacks.splice(index, 1);
    return this;
  }

  on(eventName: string, listener: Listener): this {
    this.addListener(eventName, listener);
    return this;
  }

  off(eventName: string | symbol, listener: Listener): this {
    return this.removeListener(eventName, listener);
  }

  removeAllListeners(eventName?: string | symbol | undefined): this {
    if (eventName === undefined) {
      this.repeatCallbacks = {};
      return this;
    }
    if (!this.repeatCallbacks[eventName]) {
      return this;
    }
    delete this.repeatCallbacks[eventName];
    return this;
  }

  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }

  getMaxListeners(): number {
    return this.maxListeners;
  }

  listeners(eventName: string | symbol): Listener[] {
    return [...(this.repeatCallbacks[eventName] || [])];
  }

  rawListeners(eventName: string | symbol): Listener[] {
    return [
      ...(this.repeatCallbacks[eventName] || []),
      ...(this.onceCallbacks[eventName] || []),
    ];
  }

  listenerCount(eventName: string | symbol): number {
    return this.repeatCallbacks[eventName]?.length || 0;
  }

  prependListener(eventName: string | symbol, listener: Listener): this {
    const callbacks = this.repeatCallbacks[eventName] || [];
    this.repeatCallbacks[eventName] = callbacks;
    callbacks.unshift(listener);
    return this;
  }

  prependOnceListener(eventName: string | symbol, listener: Listener): this {
    const callbacks = this.onceCallbacks[eventName] || [];
    this.onceCallbacks[eventName] = callbacks;
    callbacks.unshift(listener);
    return this;
  }

  once(eventName: string | symbol, listener: Listener): this {
    const callbacks = this.onceCallbacks[eventName] || [];
    this.onceCallbacks[eventName] = callbacks;
    callbacks.push(listener);
    return this;
  }

  emit(eventName: string | symbol, ...args: unknown[]): boolean {
    const exists = Boolean(
      this.repeatCallbacks[eventName] || this.onceCallbacks[eventName]
    );
    (this.repeatCallbacks[eventName] || []).forEach((c) => c(...args));
    (this.onceCallbacks[eventName] || []).forEach((c) => c(...args));
    this.onceCallbacks[eventName] = [];
    return exists;
  }

  eventNames(): (string | symbol)[] {
    throw new Error("Method not implemented.");
  }

  write(chunk: Uint8Array | string): boolean {
    this.chunks.push(typeof chunk === "string" ? stringToUtf8(chunk) : chunk);
    return true;
  }

  end(): this {
    this.onEnd?.(this.chunks)
      .then(() => {
        this.emit("done", this);
      })
      .catch(() => {
        this.emit("done", this);
      });
    return this;
  }
}
