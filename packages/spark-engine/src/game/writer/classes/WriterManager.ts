import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";
import { Phrase } from "../types/Phrase";
import {
  AudioEvent,
  ButtonEvent,
  ImageEvent,
  SynthEvent,
  TextEvent,
} from "../types/SequenceEvent";
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
    options?: WriteOptions
  ): {
    button: Record<string, ButtonEvent[]>;
    text: Record<string, TextEvent[]>;
    image: Record<string, ImageEvent[]>;
    audio: Record<string, AudioEvent[]>;
    synth: Record<string, SynthEvent[]>;
    end: number;
  } {
    return write(content, options);
  }
}
