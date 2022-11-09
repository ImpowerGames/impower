import { Game } from "./core/classes/Game";
import { Manager } from "./core/classes/Manager";
import {
  DebugConfig,
  DebugManager,
  DebugState,
} from "./debug/classes/DebugManager";
import {
  InputConfig,
  InputManager,
  InputState,
} from "./input/classes/InputManager";
import {
  LogicConfig,
  LogicManager,
  LogicState,
} from "./logic/classes/LogicManager";
import {
  PhysicsConfig,
  PhysicsManager,
  PhysicsState,
} from "./physics/classes/PhysicsManager";
import {
  RandomConfig,
  RandomManager,
  RandomState,
} from "./random/classes/RandomManager";
import {
  StructConfig,
  StructManager,
  StructState,
} from "./struct/classes/StructManager";
import {
  SynthConfig,
  SynthManager,
  SynthState,
} from "./synth/classes/SynthManager";
import {
  TickerConfig,
  TickerManager,
  TickerState,
} from "./ticker/classes/TickerManager";
import {
  WorldConfig,
  WorldManager,
  WorldState,
} from "./world/classes/WorldManager";

export interface SparkGameConfig {
  debug?: Partial<DebugConfig>;
  input?: Partial<InputConfig>;
  logic?: Partial<LogicConfig>;
  physics?: Partial<PhysicsConfig>;
  random?: Partial<RandomConfig>;
  struct?: Partial<StructConfig>;
  synth?: Partial<SynthConfig>;
  ticker?: Partial<TickerConfig>;
  world?: Partial<WorldConfig>;
}

export interface SparkGameState {
  debug?: Partial<DebugState>;
  input?: Partial<InputState>;
  logic?: Partial<LogicState>;
  physics?: Partial<PhysicsState>;
  random?: Partial<RandomState>;
  struct?: Partial<StructState>;
  synth?: Partial<SynthState>;
  ticker?: Partial<TickerState>;
  world?: Partial<WorldState>;
}

export class SparkGame extends Game {
  debug: DebugManager;
  input: InputManager;
  logic: LogicManager;
  physics: PhysicsManager;
  random: RandomManager;
  struct: StructManager;
  synth: SynthManager;
  ticker: TickerManager;
  world: WorldManager;

  constructor(config?: SparkGameConfig, state?: SparkGameState) {
    super();
    this.debug = new DebugManager(config?.debug, state?.debug);
    this.input = new InputManager(config?.input, state?.input);
    this.logic = new LogicManager(config?.logic, state?.logic);
    this.physics = new PhysicsManager(config?.physics, state?.physics);
    this.random = new RandomManager(config?.random, state?.random);
    this.struct = new StructManager(config?.struct, state?.struct);
    this.synth = new SynthManager(config?.synth, state?.synth);
    this.ticker = new TickerManager(config?.ticker, state?.ticker);
    this.world = new WorldManager(config?.world, state?.world);
  }

  override managers(): Record<string, Manager> {
    return {
      debug: this.debug,
      input: this.input,
      logic: this.logic,
      physics: this.physics,
      random: this.random,
      struct: this.struct,
      synth: this.synth,
      ticker: this.ticker,
      world: this.world,
    };
  }
}
