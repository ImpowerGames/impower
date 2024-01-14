import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { GameContext } from "../../core/types/GameContext";
import { uuid } from "../../core/utils/uuid";

export interface UUIDEvents extends Record<string, GameEvent> {}

export interface UUIDConfig {
  generator: () => string;
}

export interface UUIDState {}

export class UUIDManager extends Manager<UUIDEvents, UUIDConfig, UUIDState> {
  constructor(
    context: GameContext,
    config?: Partial<UUIDConfig>,
    state?: Partial<UUIDState>
  ) {
    const initialEvents: UUIDEvents = {};
    const initialConfig: UUIDConfig = {
      generator: uuid,
      ...(config || {}),
    };
    super(context, initialEvents, initialConfig, state || {});
  }

  generate(): string {
    return this._config.generator();
  }
}
