import { GameEvent } from "../../../core/classes/GameEvent";
import { Manager } from "../../../core/classes/Manager";
import { GameContext } from "../../../core/types/GameContext";
import { Phrase } from "../types/Phrase";
import { WriteResult } from "../types/WriteResult";
import { WriteOptions, write } from "../utils/write";

export interface WriterEvents extends Record<string, GameEvent> {}

export interface WriterConfig {}

export interface WriterState {}

export class WriterManager extends Manager<
  WriterEvents,
  WriterConfig,
  WriterState
> {
  constructor(
    context: GameContext,
    config?: Partial<WriterConfig>,
    state?: Partial<WriterState>
  ) {
    const initialEvents: WriterEvents = {};
    const initialConfig: WriterConfig = { ...(config || {}) };
    super(context, initialEvents, initialConfig, state || {});
  }

  write(content: Phrase[], options?: WriteOptions): WriteResult {
    return write(content, this._context, options);
  }
}
