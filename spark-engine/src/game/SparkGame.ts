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
import { UIConfig, UIManager, UIState } from "./ui/classes/UIManager";
import {
  WorldConfig,
  WorldManager,
  WorldState,
} from "./world/classes/WorldManager";
import {
  WriterConfig,
  WriterManager,
  WriterState,
} from "./writer/classes/WriterManager";

export interface SparkGameConfig {
  debug?: Partial<DebugConfig>;
  input?: Partial<InputConfig>;
  logic?: Partial<LogicConfig>;
  random?: Partial<RandomConfig>;
  struct?: Partial<StructConfig>;
  synth?: Partial<SynthConfig>;
  ticker?: Partial<TickerConfig>;
  ui?: Partial<UIConfig>;
  writer?: Partial<WriterConfig>;
  world?: Partial<WorldConfig>;
  physics?: Partial<PhysicsConfig>;
}

export interface SparkGameState {
  debug?: Partial<DebugState>;
  input?: Partial<InputState>;
  logic?: Partial<LogicState>;
  random?: Partial<RandomState>;
  struct?: Partial<StructState>;
  synth?: Partial<SynthState>;
  ticker?: Partial<TickerState>;
  ui?: Partial<UIState>;
  writer?: Partial<WriterState>;
  world?: Partial<WorldState>;
  physics?: Partial<PhysicsState>;
}

export class SparkGame extends Game {
  debug: DebugManager;
  input: InputManager;
  logic: LogicManager;
  random: RandomManager;
  struct: StructManager;
  synth: SynthManager;
  ticker: TickerManager;
  ui: UIManager;
  writer: WriterManager;
  world: WorldManager;
  physics: PhysicsManager;

  constructor(
    config?: Partial<SparkGameConfig>,
    state?: Partial<SparkGameState>
  ) {
    super();
    this.debug = new DebugManager(config?.debug, state?.debug);
    this.input = new InputManager(config?.input, state?.input);
    this.logic = new LogicManager(config?.logic, state?.logic);
    this.random = new RandomManager(config?.random, state?.random);
    this.struct = new StructManager(config?.struct, state?.struct);
    this.synth = new SynthManager(config?.synth, state?.synth);
    this.ticker = new TickerManager(config?.ticker, state?.ticker);
    this.ui = new UIManager(config?.ui, state?.ui);
    this.writer = new WriterManager(config?.writer, state?.writer);
    this.world = new WorldManager(config?.world, state?.world);
    this.physics = new PhysicsManager(config?.physics, state?.physics);
  }

  override managers(): Record<string, Manager> {
    return {
      debug: this.debug,
      input: this.input,
      logic: this.logic,
      random: this.random,
      struct: this.struct,
      synth: this.synth,
      ticker: this.ticker,
      ui: this.ui,
      writer: this.writer,
      world: this.world,
      physics: this.physics,
    };
  }
}
