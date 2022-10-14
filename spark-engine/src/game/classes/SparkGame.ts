import { Block } from "../interfaces/Block";
import { GameConfig } from "../interfaces/GameConfig";
import { SaveData } from "../interfaces/SaveData";
import { GameEvent } from "./GameEvent";
import { Manager } from "./Manager";
import { AssetManager } from "./managers/AssetManager";
import { AudioManager } from "./managers/AudioManager";
import { DebugManager } from "./managers/DebugManager";
import { EntityManager } from "./managers/EntityManager";
import { InputManager } from "./managers/InputManager";
import { LogicManager } from "./managers/LogicManager";
import { PhysicsManager } from "./managers/PhysicsManager";
import { RandomManager } from "./managers/RandomManager";
import { StructManager } from "./managers/StructManager";

export interface GameEvents {
  onStart: GameEvent;
  onEnd: GameEvent;
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

  private _input: InputManager;

  public get input(): InputManager {
    return this._input;
  }

  private _physics: PhysicsManager;

  public get physics(): PhysicsManager {
    return this._physics;
  }

  private _asset: AssetManager;

  public get asset(): AssetManager {
    return this._asset;
  }

  private _audio: AudioManager;

  public get audio(): AudioManager {
    return this._audio;
  }

  private _entity: EntityManager;

  public get entity(): EntityManager {
    return this._entity;
  }

  private _logic: LogicManager;

  public get logic(): LogicManager {
    return this._logic;
  }

  private _struct: StructManager;

  public get struct(): StructManager {
    return this._struct;
  }

  private _random: RandomManager;

  public get random(): RandomManager {
    return this._random;
  }

  private _custom: { [key: string]: Manager };

  public get custom(): { [key: string]: Manager } {
    return this._custom;
  }

  constructor(
    blockMap: Record<string, Block>,
    objectMap: Record<string, Record<string, unknown>>,
    config?: GameConfig
  ) {
    this._debug = new DebugManager({
      debugging: config?.debugging,
      currentLogs: [],
    });
    this._input = new InputManager();
    this._physics = new PhysicsManager();
    this._asset = new AssetManager(config?.saveData?.asset);
    this._audio = new AudioManager(config?.saveData?.audio);
    this._entity = new EntityManager(config?.saveData?.entity);
    this._struct = new StructManager(objectMap, config?.saveData?.entity);
    const activeParentBlockId = config?.startBlockId || "";
    const activeCommandIndex = config?.startCommandIndex || 0;
    this._logic = new LogicManager(
      blockMap,
      config?.saveData?.logic || {
        activeParentBlockId,
        activeCommandIndex,
        changedBlocks: [],
        changedVariables: [],
        loadedBlockIds: [],
        loadedAssetIds: [],
        blockStates: {},
        variableStates: {},
      }
    );
    this._random = new RandomManager(
      config?.saveData?.random || { seed: config?.seed || "" }
    );
    this._events = {
      onStart: new GameEvent(),
      onEnd: new GameEvent(),
    };
    this._custom = {};
  }

  init(): void {
    this.debug.init();
    this.random.init();
    this.input.init();
    this.physics.init();
    this.asset.init();
    this.audio.init();
    this.struct.init();
    this.entity.init();
    this.logic.init();
    Object.values(this.custom).forEach((manager) => {
      manager.init();
    });
    this.events.onStart.emit();
  }

  async start(): Promise<void> {
    const promises = [
      this.audio.start(),
      ...Object.values(this.custom).map((manager) => manager.start()),
    ];
    await Promise.all(promises);
  }

  end(): void {
    this.logic.destroy();
    this.entity.destroy();
    this.struct.destroy();
    this.asset.destroy();
    this.audio.destroy();
    this.input.destroy();
    this.physics.destroy();
    this.random.destroy();
    this.debug.destroy();
    Object.values(this.custom).forEach((manager) => {
      manager.destroy();
    });
    this.events.onEnd.emit();
  }

  getSaveData(): SaveData {
    const random = this.random.getSaveData();
    const asset = this.asset.getSaveData();
    const audio = this.audio.getSaveData();
    const struct = this.struct.getSaveData();
    const entity = this.entity.getSaveData();
    const logic = this.logic.getSaveData();
    const custom: { [key: string]: unknown } = {};
    Object.keys(this.custom).forEach((id) => {
      custom[id] = this.custom[id].getSaveData();
    });
    return {
      asset,
      audio,
      struct,
      entity,
      logic,
      random,
      custom,
    };
  }

  getRuntimeValue?(id: string): unknown {
    const variableState = this.logic.state?.variableStates?.[id];
    if (variableState) {
      return variableState.value;
    }
    const blockState = this.logic.state?.blockStates?.[id];
    if (blockState) {
      return blockState.executionCount;
    }
    return undefined;
  }

  setRuntimeValue?(id: string, value: unknown): void {
    const variableState = this.logic.state?.variableStates?.[id];
    if (variableState) {
      variableState.value = value;
    } else {
      if (!this.logic.state.variableStates[id]) {
        this.logic.state.changedVariables.push(id);
      }
      this.logic.state.variableStates[id] = {
        name: id.split(".").slice(-1).join(""),
        value,
      };
    }
  }
}
