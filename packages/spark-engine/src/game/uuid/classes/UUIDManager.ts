import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";
import { uuid } from "../../core/utils/uuid";

export interface UUIDEvents extends Record<string, GameEvent> {}

export interface UUIDConfig {
  generator: () => string;
}

export interface UUIDState {}

export class UUIDManager extends Manager<UUIDEvents, UUIDConfig, UUIDState> {
  constructor(
    environment: Environment,
    config?: Partial<UUIDConfig>,
    state?: Partial<UUIDState>
  ) {
    const initialEvents: UUIDEvents = {};
    const initialConfig: UUIDConfig = {
      generator: uuid,
      ...(config || {}),
    };
    const initialState: UUIDState = { ...(state || {}) };
    super(environment, initialEvents, initialConfig, initialState);
  }

  generate(): string {
    return this.config.generator();
  }
}
