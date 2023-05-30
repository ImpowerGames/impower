import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { IElement } from "../../ui";
import { Character } from "../types/Character";
import { Phrase } from "../types/Phrase";
import { Writer } from "../types/Writer";
import { write } from "../utils/write";

export interface WriterEvents extends Record<string, GameEvent> {}

export interface WriterConfig {}

export interface WriterState {}

export class WriterManager extends Manager<
  WriterEvents,
  WriterConfig,
  WriterState
> {
  constructor(config?: Partial<WriterConfig>, state?: Partial<WriterState>) {
    const initialEvents: WriterEvents = {};
    const initialConfig: WriterConfig = { ...(config || {}) };
    const initialState: WriterState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  write(
    content: string,
    valueMap: Record<string, unknown>,
    writer: Writer | undefined,
    character: Character | undefined,
    instant = false,
    debug?: boolean,
    onCreateElement?: () => IElement
  ): Phrase[] {
    const phrases = write(
      content,
      valueMap,
      writer,
      character,
      instant,
      debug,
      onCreateElement
    );
    return phrases;
  }
}
