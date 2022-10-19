import { CameraState } from "../../interfaces/CameraState";
import { EntityState } from "../../interfaces/EntityState";
import { createCameraState } from "../../utils/createCameraState";
import { createEntityState } from "../../utils/createEntityState";
import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

export interface WorldState {
  mainCamera: string;
  activeCameras: string[];
  cameraStates: Record<string, CameraState>;
}

export interface WorldEvents {
  onSpawnEntity: GameEvent<{
    entityId: string;
    cameraId?: string;
    entityState: EntityState;
  }>;
  onDestroyEntity: GameEvent<{ entityId: string; cameraId?: string }>;
  onAddCamera: GameEvent<{ cameraId: string; cameraState: CameraState }>;
  onRemoveCamera: GameEvent<{ cameraId: string }>;
}

export class WorldManager extends Manager<WorldState, WorldEvents> {
  private _defaultCameras: Record<string, CameraState>;

  public get defaultCameras(): Record<string, CameraState> {
    return this._defaultCameras;
  }

  private _defaultEntities: Record<string, EntityState>;

  public get defaultEntities(): Record<string, EntityState> {
    return this._defaultEntities;
  }

  constructor(
    state?: WorldState,
    defaultCameras?: Record<string, CameraState>,
    defaultEntities?: Record<string, EntityState>
  ) {
    super(state);
    this._defaultCameras = {
      main: createCameraState(),
      ...(defaultCameras || {}),
    };
    this._defaultEntities = defaultEntities || {};
  }

  getInitialState(): WorldState {
    return {
      mainCamera: "main",
      activeCameras: ["main"],
      cameraStates: { main: createCameraState() },
    };
  }

  getInitialEvents(): WorldEvents {
    return {
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
  }

  override getSaveData(): WorldState {
    return this.deepCopyState(this.state);
  }

  private getCameraState(cameraId?: string): CameraState | undefined {
    const id = cameraId || this.state.mainCamera;
    if (this.state.cameraStates[id]) {
      return this.state.cameraStates[id];
    }
    return undefined;
  }

  private getOrCreateCameraState(cameraId?: string): CameraState {
    const id = cameraId || this.state.mainCamera;
    const state = this.state.cameraStates[id];
    if (state) {
      return state;
    }
    const d = this.defaultCameras[id];
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
    const d = this._defaultEntities[entityId];
    const c = createEntityState();
    return this.deepCopy({
      position: d?.position || c.position,
      rotation: d?.rotation || c.rotation,
      scale: d?.scale || c.scale,
    });
  }

  addCamera(cameraId: string, cameraState?: CameraState): void {
    const s = cameraState || this.getOrCreateCameraState(cameraId);
    this.state.cameraStates[cameraId] = s;
    this.events.onAddCamera.emit({
      cameraId,
      cameraState: s,
    });
  }

  removeCamera(cameraId: string): void {
    delete this.state.cameraStates[cameraId];
    this.events.onRemoveCamera.emit({ cameraId });
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
    this.events.onSpawnEntity.emit({
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
    this.events.onDestroyEntity.emit({ entityId, cameraId });
  }
}
