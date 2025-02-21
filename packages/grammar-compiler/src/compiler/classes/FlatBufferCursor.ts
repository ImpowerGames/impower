import { BufferCursor } from "../types/BufferCursor";

export class FlatBufferCursor implements BufferCursor {
  constructor(
    readonly buffer: Int32Array | readonly number[],
    public index: number
  ) {}

  get id() {
    return this.buffer[this.index - 4]!;
  }
  get start() {
    return this.buffer[this.index - 3]!;
  }
  get end() {
    return this.buffer[this.index - 2]!;
  }
  get size() {
    return this.buffer[this.index - 1]!;
  }

  get pos() {
    return this.index;
  }

  next() {
    this.index -= 4;
  }

  fork() {
    return new FlatBufferCursor(this.buffer, this.index);
  }
}
