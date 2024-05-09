import { Module } from "../../../core/classes/Module";
import type { Phrase } from "../types/Phrase";
import type { WriteResult } from "../types/WriteResult";
import { WriteOptions, write } from "../utils/write";
import { WriterBuiltins, writerBuiltins } from "../writerBuiltins";
import { writerCommands } from "../writerCommands";

export interface WriterConfig {}

export interface WriterState {}

export interface WriterMessageMap extends Record<string, any> {}

export class WriterModule extends Module<
  WriterState,
  WriterMessageMap,
  WriterBuiltins
> {
  override getBuiltins() {
    return writerBuiltins();
  }

  override getStored() {
    return [];
  }

  override getCommands() {
    return writerCommands(this._game);
  }

  write(content: Phrase[], options?: WriteOptions): WriteResult {
    return write(content, this.context, options);
  }
}
