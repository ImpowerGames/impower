import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface StructEvents extends Record<string, GameEvent> {}

export interface StructConfig {
  objectMap: { [type: string]: Record<string, unknown> };
}

export interface StructState {}

export class StructManager extends Manager<
  StructEvents,
  StructConfig,
  StructState
> {
  constructor(config?: Partial<StructConfig>, state?: Partial<StructState>) {
    const initialEvents: StructEvents = {};
    const initialConfig: StructConfig = { objectMap: {}, ...(config || {}) };
    const initialState: StructState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }
}
