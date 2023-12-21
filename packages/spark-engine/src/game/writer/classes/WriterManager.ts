import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";
import { Character } from "../specs/Character";
import { Writer } from "../specs/Writer";
import { Phrase } from "../types/Phrase";
import { write } from "../utils/write";

export interface WriterEvents extends Record<string, GameEvent> {}

export interface WriterConfig {}

export interface WriterState {}

export class WriterManager extends Manager<
  WriterEvents,
  WriterConfig,
  WriterState
> {
  constructor(
    environment: Environment,
    config?: Partial<WriterConfig>,
    state?: Partial<WriterState>
  ) {
    const initialEvents: WriterEvents = {};
    const initialConfig: WriterConfig = { ...(config || {}) };
    const initialState: WriterState = { ...(state || {}) };
    super(environment, initialEvents, initialConfig, initialState);
  }

  write(
    content: Phrase[],
    options?: {
      writer?: Writer;
      character?: Character;
      syllableDuration: number;
      instant?: boolean;
      debug?: boolean;
    }
  ): Phrase[] {
    return write(content, options);
  }
}
