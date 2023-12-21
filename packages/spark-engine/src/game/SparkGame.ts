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
  SoundConfig,
  SoundManager,
  SoundState,
} from "./sound/classes/SoundManager";
import { TweenConfig, TweenManager, TweenState } from "./tween";
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
  tween?: Partial<TweenConfig>;
  sound?: Partial<SoundConfig>;
  writer?: Partial<WriterConfig>;
  world?: Partial<WorldConfig>;
  physics?: Partial<PhysicsConfig>;
}

export interface SparkGameState extends GameState {
  input?: Partial<InputState>;
  tween?: Partial<TweenState>;
  sound?: Partial<SoundState>;
  writer?: Partial<WriterState>;
  world?: Partial<WorldState>;
  physics?: Partial<PhysicsState>;
}

export class SparkGame extends Game {
  input: InputManager;
  tween: TweenManager;
  sound: SoundManager;
  writer: WriterManager;
  world: WorldManager;
  physics: PhysicsManager;

  constructor(
    config?: Partial<SparkGameConfig>,
    state?: Partial<SparkGameState>
  ) {
    super(config, state);
    this.input = new InputManager(
      this.environment,
      config?.input,
      state?.input
    );
    this.tween = new TweenManager(
      this.environment,
      config?.tween,
      state?.tween
    );
    this.sound = new SoundManager(
      this.environment,
      config?.sound,
      state?.sound
    );
    this.writer = new WriterManager(
      this.environment,
      config?.writer,
      state?.writer
    );
    this.world = new WorldManager(
      this.environment,
      config?.world,
      state?.world
    );
    this.physics = new PhysicsManager(
      this.environment,
      config?.physics,
      state?.physics
    );
  }

  override managers(): Record<string, Manager> {
    return {
      input: this.input,
      tween: this.tween,
      sound: this.sound,
      writer: this.writer,
      world: this.world,
      physics: this.physics,
      ...super.managers(),
    };
  }
}
