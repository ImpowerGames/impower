import { IBufferCursor } from "../types/IBufferCursor";

export class FlatBufferCursor implements IBufferCursor {
  constructor(readonly buffer: Uint16Array, public index: number) {}

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
