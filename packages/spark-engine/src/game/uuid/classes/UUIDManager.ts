import { uuid } from "../../../../../spark-evaluate/src";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface UUIDEvents extends Record<string, GameEvent> {}

export interface UUIDConfig {
  generator: () => string;
}

export interface UUIDState {}

export class UUIDManager extends Manager<UUIDEvents, UUIDConfig, UUIDState> {
  constructor(config?: Partial<UUIDConfig>, state?: Partial<UUIDState>) {
    const initialEvents: UUIDEvents = {};
    const initialConfig: UUIDConfig = {
      generator: uuid,
      ...(config || {}),
    };
    const initialState: UUIDState = { seed: "", ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  generate(): string {
    return uuid();
  }
}