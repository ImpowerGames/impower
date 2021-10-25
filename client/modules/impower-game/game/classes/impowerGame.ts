import { GameConfig } from "../interfaces/gameConfig";
import { SaveData } from "../interfaces/saveData";
import { PhysicsManager } from "./managers/physicsManager";
import { AssetManager } from "./managers/assetManager";
import { EntityManager } from "./managers/entityManager";
import { LogicManager } from "./managers/logicManager";
import { DebugManager } from "./managers/debugManager";
import { GameEvent } from "./events/gameEvent";
import { RandomManager } from "./managers/randomManager";
import { Manager } from "./managers/manager";

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
    this._physics = new PhysicsManager();
    this._asset = new AssetManager(saveData?.asset);
    this._entity = new EntityManager(saveData?.entity);
    this._logic = new LogicManager(
      config.blockTree,
      saveData?.logic || {
        activeParentBlockId: config.defaultStartBlockId,
        blockStates: {},
        variableStates: {},
        triggerStates: {},
        activeBlockIds: [],
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
    this.physics.destroy();
    this.debug.destroy();
    this.random.destroy();
    Object.values(this.custom).forEach((manager) => {
      manager.destroy();
    });
    this.events.onEnd.emit(null);
  }

  start(): void {
    this.debug.start();
    this.physics.start();
    this.asset.start();
    this.entity.start();
    this.logic.start();
    this.random.start();
    Object.values(this.custom).forEach((manager) => {
      manager.start();
    });
    this.events.onStart.emit(null);
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
}
