import { randomizer, uuid } from "../../../../../spark-evaluate";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface RandomEvents extends Record<string, GameEvent> {
  onRegenerateSeed: GameEvent<{ seed: string }>;
  onSetSeed: GameEvent<{ seed: string }>;
}

export interface RandomConfig {
  randomizer: () => number;
}

export interface RandomState {
  seed: string;
}

export class RandomManager extends Manager<
  RandomEvents,
  RandomConfig,
  RandomState
> {
  constructor(config?: Partial<RandomConfig>, state?: Partial<RandomState>) {
    const initialEvents: RandomEvents = {
      onRegenerateSeed: new GameEvent<{ seed: string }>(),
      onSetSeed: new GameEvent<{ seed: string }>(),
    };
    const initialConfig: RandomConfig = {
      randomizer: randomizer(""),
      ...(config || {}),
    };
    const initialState: RandomState = { seed: "", ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  getNewSeed(): string {
    return uuid();
  }

  regenerateSeed(): string {
    const seed = this.getNewSeed();
    this._state.seed = seed;
    this._config.randomizer = randomizer(this._state.seed);
    this._events.onRegenerateSeed.emit({ seed });
    return seed;
  }

  setSeed(seed: string): void {
    this._state.seed = seed;
    this._config.randomizer = randomizer(this._state.seed);
    this._events.onSetSeed.emit({ seed });
  }

  reseed(newSeed: string): void {
    this._config.randomizer = randomizer(this._state.seed + newSeed);
  }

  reset(): void {
    this._config.randomizer = randomizer(this._state.seed);
  }

  shuffle<T>(array: T[]): T[] {
    const newArray = array;
    let currentIndex = newArray.length;
    let temporaryValue;
    let randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
      // Pick a remaining element...
      const random = this._config.randomizer();
      randomIndex = Math.floor(random * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = newArray[currentIndex];
      newArray[currentIndex] = newArray[randomIndex] as T;
      newArray[randomIndex] = temporaryValue as T;
    }

    return newArray;
  }

  private toFinite(value: number | undefined): number {
    if (!value) {
      return value === 0 ? value : 0;
    }
    if (
      value === Number.POSITIVE_INFINITY ||
      value === Number.NEGATIVE_INFINITY
    ) {
      const sign = value < 0 ? -1 : 1;
      return sign * Number.MAX_SAFE_INTEGER;
    }
    return value;
  }

  next(min?: number, max?: number, float?: boolean): number {
    let lower = min;
    let upper = max;
    if (lower === undefined && upper === undefined) {
      lower = 0;
      upper = 1;
    } else {
      lower = this.toFinite(lower);
      if (upper === undefined) {
        upper = lower;
        lower = 0;
      } else {
        upper = this.toFinite(upper);
      }
    }
    if (lower > upper) {
      const temp = lower;
      lower = upper;
      upper = temp;
    }
    if (float || lower % 1 || upper % 1) {
      const rand = this._config.randomizer();
      const randLength = `${rand}`.length - 1;
      return Math.min(
        lower + rand * (upper - lower + parseFloat(`1e-${randLength}`)),
        upper
      );
    }
    return lower + Math.floor(this._config.randomizer() * (upper - lower + 1));
  }
}