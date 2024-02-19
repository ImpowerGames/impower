import { Manager } from "../../../core/classes/Manager";
import { Phrase } from "../types/Phrase";
import { WriteResult } from "../types/WriteResult";
import { WriteOptions, write } from "../utils/write";

export interface WriterConfig {}

export interface WriterState {}

export class WriterManager extends Manager<WriterState> {
  write(content: Phrase[], options?: WriteOptions): WriteResult {
    return write(content, this._context, options);
  }
}
