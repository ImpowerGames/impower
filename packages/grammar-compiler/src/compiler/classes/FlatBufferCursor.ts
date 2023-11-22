import { IBufferCursor } from "../types/IBufferCursor";

export default class FlatBufferCursor implements IBufferCursor {
  constructor(public readonly buffer: Int32Array, public pos = buffer.length) {}

  get id() {
    return this.buffer[this.pos - 4]!;
  }
  get start() {
    return this.buffer[this.pos - 3]!;
  }
  get end() {
    return this.buffer[this.pos - 2]!;
  }
  get size() {
    return this.buffer[this.pos - 1]!;
  }

  next() {
    this.pos -= 4;
  }

  fork() {
    return new FlatBufferCursor(this.buffer, this.pos);
  }
}
