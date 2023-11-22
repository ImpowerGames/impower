import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface StructEvents extends Record<string, GameEvent> {}

export interface StructConfig {
  typeMap: { [type: string]: Record<string, any> };
}

export interface StructState {}

export class StructManager extends Manager<
  StructEvents,
  StructConfig,
  StructState
> {
  constructor(config?: Partial<StructConfig>, state?: Partial<StructState>) {
    const initialEvents: StructEvents = {};
    const initialConfig: StructConfig = { typeMap: {}, ...(config || {}) };
    const initialState: StructState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }
}
