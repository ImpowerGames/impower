import { GameEvent1, GameEvent2, GameEvent3, clone } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { GameContext } from "../../core/types/GameContext";
import { CameraState } from "../types/CameraState";
import { EntityState } from "../types/EntityState";
import { createCameraState } from "../utils/createCameraState";
import { createEntityState } from "../utils/createEntityState";

export interface WorldEvents extends Record<string, GameEvent> {
  onSpawnEntity: GameEvent3<string, string, EntityState>;
  onDestroyEntity: GameEvent2<string, string>;
  onAddCamera: GameEvent2<string, CameraState>;
  onRemoveCamera: GameEvent1<string>;
}

export interface WorldConfig {
  defaultCameras: Record<string, CameraState>;
  defaultEntities: Record<string, EntityState>;
}

export interface WorldState {}

export class WorldManager extends Manager<
  WorldEvents,
  WorldConfig,
  WorldState
> {
  protected _mainCamera: string = "";

  protected _activeCameras: string[] = [];

  protected _cameraStates: Record<string, CameraState> = {};

  constructor(
    context: GameContext,
    config?: Partial<WorldConfig>,
    state?: Partial<WorldState>
  ) {
    const initialEvents: WorldEvents = {
      onSpawnEntity: new GameEvent3<string, string, EntityState>(),
      onDestroyEntity: new GameEvent2<string, string>(),
      onAddCamera: new GameEvent2<string, CameraState>(),
      onRemoveCamera: new GameEvent1<string>(),
    };
    const initialConfig: WorldConfig = {
      defaultCameras: {
        default: createCameraState(),
      },
      defaultEntities: {},
      ...(config || {}),
    };
    super(context, initialEvents, initialConfig, state || {});
  }

  private getCameraState(cameraId?: string): CameraState | undefined {
    const id = cameraId || this._mainCamera;
    if (this._cameraStates[id]) {
      return this._cameraStates[id];
    }
    return undefined;
  }

  private getOrCreateCameraState(cameraId?: string): CameraState {
    const id = cameraId || this._mainCamera;
    const state = this._cameraStates[id];
    if (state) {
      return state;
    }
    const d = this._config.defaultCameras[id];
    const c = createCameraState();
    return clone({
      position: d?.position || c.position,
      rotation: d?.rotation || c.rotation,
      scale: d?.scale || c.scale,
      type: d?.type || c.type,
      depth: d?.depth || c.depth,
      width: d?.width || c.width,
      height: d?.height || c.height,
      fit: d?.fit || c.fit,
      background: d?.background || c.background,
      color: d?.color || c.color,
      spawnedEntities: d?.spawnedEntities || c.spawnedEntities,
      entities: d?.entities || c.entities,
    }) as CameraState;
  }

  private getOrCreateEntityState(
    entityId: string,
    cameraId?: string
  ): EntityState {
    const cameraState = this.getCameraState(cameraId);
    const state = cameraState?.entities[entityId];
    if (state) {
      return state;
    }
    const d = this._config.defaultEntities[entityId];
    const c = createEntityState();
    return clone({
      position: d?.position || c.position,
      rotation: d?.rotation || c.rotation,
      scale: d?.scale || c.scale,
    });
  }

  addCamera(cameraId: string, cameraState?: CameraState): void {
    const s = cameraState || this.getOrCreateCameraState(cameraId);
    this._cameraStates[cameraId] = s;
    this._events.onAddCamera.dispatch(cameraId, s);
  }

  removeCamera(cameraId: string): void {
    delete this._cameraStates[cameraId];
    this._events.onRemoveCamera.dispatch(cameraId);
  }

  spawnEntity(
    entityId: string,
    cameraId?: string,
    entityState?: EntityState
  ): boolean {
    const camera = this.getCameraState(cameraId);
    if (!camera) {
      return false;
    }
    camera.spawnedEntities.push(entityId);
    const s = entityState || this.getOrCreateEntityState(entityId, cameraId);
    camera.entities[entityId] = s;
    this._events.onSpawnEntity.dispatch(entityId, cameraId ?? "", s);
    return true;
  }

  destroyEntity(entityId: string, cameraId?: string): void {
    const camera = this.getCameraState(cameraId);
    if (!camera) {
      return;
    }
    camera.spawnedEntities = camera.spawnedEntities.filter(
      (x) => x !== entityId
    );
    this._events.onDestroyEntity.dispatch(entityId, cameraId ?? "");
  }
}
