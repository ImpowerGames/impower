import { Game, GameConfig, GameState } from "./core/classes/Game";
import { Manager } from "./core/classes/Manager";
import {
  InputConfig,
  InputManager,
  InputState,
} from "./input/classes/InputManager";
import {
  PhysicsConfig,
  PhysicsManager,
  PhysicsState,
} from "./physics/classes/PhysicsManager";
import {
  SynthConfig,
  SynthManager,
  SynthState,
} from "./synth/classes/SynthManager";
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

export interface SparkGameConfig extends GameConfig {
  input?: Partial<InputConfig>;
  synth?: Partial<SynthConfig>;
  writer?: Partial<WriterConfig>;
  world?: Partial<WorldConfig>;
  physics?: Partial<PhysicsConfig>;
}

export interface SparkGameState extends GameState {
  input?: Partial<InputState>;
  synth?: Partial<SynthState>;
  writer?: Partial<WriterState>;
  world?: Partial<WorldState>;
  physics?: Partial<PhysicsState>;
}

export class SparkGame extends Game {
  input: InputManager;
  synth: SynthManager;
  writer: WriterManager;
  world: WorldManager;
  physics: PhysicsManager;

  constructor(
    config?: Partial<SparkGameConfig>,
    state?: Partial<SparkGameState>
  ) {
    super(config, state);
    this.input = new InputManager(config?.input, state?.input);
    this.synth = new SynthManager(config?.synth, state?.synth);
    this.writer = new WriterManager(config?.writer, state?.writer);
    this.world = new WorldManager(config?.world, state?.world);
    this.physics = new PhysicsManager(config?.physics, state?.physics);
  }

  override managers(): Record<string, Manager> {
    return {
      input: this.input,
      synth: this.synth,
      writer: this.writer,
      world: this.world,
      physics: this.physics,
      ...super.managers(),
    };
  }
}
