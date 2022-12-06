import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { CameraState } from "../types/CameraState";
import { EntityState } from "../types/EntityState";
import { createCameraState } from "../utils/createCameraState";
import { createEntityState } from "../utils/createEntityState";

export interface WorldEvents extends Record<string, GameEvent> {
  onSpawnEntity: GameEvent<{
    entityId: string;
    cameraId?: string;
    entityState: EntityState;
  }>;
  onDestroyEntity: GameEvent<{ entityId: string; cameraId?: string }>;
  onAddCamera: GameEvent<{ cameraId: string; cameraState: CameraState }>;
  onRemoveCamera: GameEvent<{ cameraId: string }>;
}

export interface WorldConfig {
  defaultCameras: Record<string, CameraState>;
  defaultEntities: Record<string, EntityState>;
}

export interface WorldState {
  mainCamera: string;
  activeCameras: string[];
  cameraStates: Record<string, CameraState>;
}

export class WorldManager extends Manager<
  WorldEvents,
  WorldConfig,
  WorldState
> {
  constructor(config?: Partial<WorldConfig>, state?: Partial<WorldState>) {
    const initialEvents: WorldEvents = {
      onSpawnEntity: new GameEvent<{
        entityId: string;
        cameraId?: string;
        entityState: EntityState;
      }>(),
      onDestroyEntity: new GameEvent<{ entityId: string; cameraId?: string }>(),
      onAddCamera: new GameEvent<{
        cameraId: string;
        cameraState: CameraState;
      }>(),
      onRemoveCamera: new GameEvent<{ cameraId: string }>(),
    };
    const initialConfig: WorldConfig = {
      defaultCameras: {
        main: createCameraState(),
      },
      defaultEntities: {},
      ...(config || {}),
    };
    const initialState: WorldState = {
      mainCamera: "main",
      activeCameras: ["main"],
      cameraStates: { main: createCameraState() },
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  private getCameraState(cameraId?: string): CameraState | undefined {
    const id = cameraId || this._state.mainCamera;
    if (this._state.cameraStates[id]) {
      return this._state.cameraStates[id];
    }
    return undefined;
  }

  private getOrCreateCameraState(cameraId?: string): CameraState {
    const id = cameraId || this._state.mainCamera;
    const state = this._state.cameraStates[id];
    if (state) {
      return state;
    }
    const d = this._config.defaultCameras[id];
    const c = createCameraState();
    return this.deepCopy({
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
    });
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
    return this.deepCopy({
      position: d?.position || c.position,
      rotation: d?.rotation || c.rotation,
      scale: d?.scale || c.scale,
    });
  }

  addCamera(cameraId: string, cameraState?: CameraState): void {
    const s = cameraState || this.getOrCreateCameraState(cameraId);
    this._state.cameraStates[cameraId] = s;
    this._events.onAddCamera.emit({
      cameraId,
      cameraState: s,
    });
  }

  removeCamera(cameraId: string): void {
    delete this._state.cameraStates[cameraId];
    this._events.onRemoveCamera.emit({ cameraId });
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
    this._events.onSpawnEntity.emit({
      entityId,
      cameraId,
      entityState: s,
    });
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
    this._events.onDestroyEntity.emit({ entityId, cameraId });
  }
}