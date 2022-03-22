import { GameConfig } from "../interfaces/gameConfig";
import { SaveData } from "../interfaces/saveData";
import { GameEvent } from "./events/gameEvent";
import { AssetManager } from "./managers/assetManager";
import { DebugManager } from "./managers/debugManager";
import { EntityManager } from "./managers/entityManager";
import { InputManager } from "./managers/inputManager";
import { LogicManager } from "./managers/logicManager";
import { Manager } from "./managers/manager";
import { PhysicsManager } from "./managers/physicsManager";
import { RandomManager } from "./managers/randomManager";

export interface GameEvents {
  onStart: GameEvent;
  onEnd: GameEvent;
}

export class ImpowerGame {
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

  private _entity: EntityManager;

  public get entity(): EntityManager {
    return this._entity;
  }

  private _logic: LogicManager;

  public get logic(): LogicManager {
    return this._logic;
  }

  private _random: RandomManager;

  public get random(): RandomManager {
    return this._random;
  }

  private _custom: { [key: string]: Manager };

  public get custom(): { [key: string]: Manager } {
    return this._custom;
  }

  private _isMobile: boolean;

  public get isMobile(): boolean {
    return this._isMobile;
  }

  constructor(config: GameConfig, isMobile: boolean, saveData?: SaveData) {
    this._debug = new DebugManager();
    this._input = new InputManager();
    this._physics = new PhysicsManager();
    this._asset = new AssetManager(saveData?.asset);
    this._entity = new EntityManager(saveData?.entity);
    const startBlockId = config.defaultStartBlockId;
    const activeParentBlockId = startBlockId || "";
    const activeCommandIndex = config.defaultStartCommandIndex || 0;
    this._logic = new LogicManager(
      config.blockTree,
      saveData?.logic || {
        activeParentBlockId,
        activeCommandIndex,
        loadedBlockIds: [],
        loadedAssetIds: [],
        blockStates: {},
        variableStates: {},
      }
    );
    this._random = new RandomManager(saveData?.random || { seed: config.seed });
    this._events = {
      onStart: new GameEvent(),
      onEnd: new GameEvent(),
    };
    this._custom = {};
    this._isMobile = isMobile;
  }

  end(): void {
    this.entity.clearPreviousConstructs();

    this.logic.destroy();
    this.entity.destroy();
    this.asset.destroy();
    this.input.destroy();
    this.physics.destroy();
    this.debug.destroy();
    this.random.destroy();
    Object.values(this.custom).forEach((manager) => {
      manager.destroy();
    });
    this.events.onEnd.emit();
  }

  start(): void {
    this.debug.start();
    this.input.start();
    this.physics.start();
    this.asset.start();
    this.entity.start();
    this.logic.start();
    this.random.start();
    Object.values(this.custom).forEach((manager) => {
      manager.start();
    });
    this.events.onStart.emit();
  }

  getSaveData(): SaveData {
    const asset = this.asset.getSaveData();
    const entity = this.entity.getSaveData();
    const logic = this.logic.getSaveData();
    const random = this.random.getSaveData();
    const custom: { [key: string]: unknown } = {};
    Object.keys(this.custom).forEach((id) => {
      custom[id] = this.custom[id].getSaveData();
    });
    return {
      asset,
      entity,
      logic,
      random,
      custom,
    };
  }

  getRuntimeValue?(id: string): string | number | boolean {
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

  setRuntimeValue?(id: string, value: string | number | boolean): void {
    const variableState = this.logic.state?.variableStates?.[id];
    if (variableState) {
      variableState.value = value;
    } else {
      this.logic.state.variableStates[id] = { value };
    }
  }
}
