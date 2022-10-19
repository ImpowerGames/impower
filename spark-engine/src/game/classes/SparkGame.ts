import { SaveData } from "../interfaces/SaveData";
import { SparkGameConfig } from "../interfaces/SparkGameConfig";
import { GameEvent } from "./GameEvent";
import { Manager } from "./Manager";
import { DebugManager } from "./managers/DebugManager";
import { InputManager } from "./managers/InputManager";
import { LogicManager } from "./managers/LogicManager";
import { PhysicsManager } from "./managers/PhysicsManager";
import { RandomManager } from "./managers/RandomManager";
import { StructManager } from "./managers/StructManager";
import { SynthManager } from "./managers/SynthManager";
import { WorldManager } from "./managers/WorldManager";

export interface GameEvents {
  onStart: GameEvent;
  onDestroy: GameEvent;
}

export class SparkGame {
  private _events: GameEvents;

  public get events(): GameEvents {
    return this._events;
  }

  private _debug: DebugManager;

  public get debug(): DebugManager {
    return this._debug;
  }

  private _random: RandomManager;

  public get random(): RandomManager {
    return this._random;
  }

  private _logic: LogicManager;

  public get logic(): LogicManager {
    return this._logic;
  }

  private _struct: StructManager;

  public get struct(): StructManager {
    return this._struct;
  }

  private _world: WorldManager;

  public get world(): WorldManager {
    return this._world;
  }

  private _input: InputManager;

  public get input(): InputManager {
    return this._input;
  }

  private _synth: SynthManager;

  public get synth(): SynthManager {
    return this._synth;
  }

  private _physics: PhysicsManager;

  public get physics(): PhysicsManager {
    return this._physics;
  }

  private _plugins: { [key: string]: Manager };

  public get plugins(): { [key: string]: Manager } {
    return this._plugins;
  }

  constructor(config: SparkGameConfig) {
    this._debug = new DebugManager({
      debugging: config?.debugging,
      currentLogs: [],
    });
    this._input = new InputManager();
    this._physics = new PhysicsManager();
    this._synth = new SynthManager(config?.saveData?.synth);
    this._world = new WorldManager(
      config?.saveData?.world,
      config?.defaultCameras,
      config?.defaultEntities
    );
    this._struct = new StructManager(
      config?.saveData?.struct,
      config?.objectMap
    );
    this._logic = new LogicManager(
      config?.saveData?.logic || {
        activeParentBlockId: config?.startBlockId || "",
        activeCommandIndex: config?.startCommandIndex || 0,
        changedBlocks: [],
        changedVariables: [],
        loadedBlockIds: [],
        loadedAssetIds: [],
        blockStates: {},
        variableStates: {},
      },
      config?.blockMap
    );
    this._random = new RandomManager(
      config?.saveData?.random || { seed: config?.seed || "" }
    );
    this._events = {
      onStart: new GameEvent(),
      onDestroy: new GameEvent(),
    };
    this._plugins = {};
  }

  init(): void {
    this.debug.init();
    this.random.init();
    this.input.init();
    this.physics.init();
    this.synth.init();
    this.struct.init();
    this.world.init();
    this.logic.init();
    Object.values(this.plugins).forEach((manager) => {
      manager.init();
    });
    this.events.onStart.emit();
  }

  async start(): Promise<void> {
    const promises = [
      this.synth.start(),
      ...Object.values(this.plugins).map((manager) => manager.start()),
    ];
    await Promise.all(promises);
  }

  destroy(): void {
    this.logic.destroy();
    this.world.destroy();
    this.struct.destroy();
    this.synth.destroy();
    this.input.destroy();
    this.physics.destroy();
    this.random.destroy();
    this.debug.destroy();
    Object.values(this.plugins).forEach((manager) => {
      manager.destroy();
    });
    this.events.onDestroy.emit();
  }

  getSaveData(): SaveData {
    const random = this.random.getSaveData();
    const synth = this.synth.getSaveData();
    const struct = this.struct.getSaveData();
    const world = this.world.getSaveData();
    const logic = this.logic.getSaveData();
    const plugins: { [key: string]: unknown } = {};
    Object.keys(this.plugins).forEach((id) => {
      plugins[id] = this.plugins[id].getSaveData();
    });
    return {
      random,
      logic,
      struct,
      world,
      synth,
      plugins,
    };
  }
}
