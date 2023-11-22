import { Input } from "../types/Input";

export class StringInput implements Input {
  constructor(readonly string: string) {}

  get length() {
    return this.string.length;
  }

  chunk(from: number) {
    return this.string.slice(from);
  }

  get lineChunks() {
    return false;
  }

  read(from: number, to: number) {
    return this.string.slice(from, to);
  }
}
