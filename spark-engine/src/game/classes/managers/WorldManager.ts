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

  constructor(
    state?: WorldState,
    defaultCameras?: Record<string, CameraState>
  ) {
    super(state);
    this._defaultCameras = {
      main: createCameraState(),
      ...(defaultCameras || {}),
    };
  }

  getInitialState(): WorldState {
    return {
      mainCamera: "main",
      activeCameras: ["main"],
      cameraStates: {},
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

  getSaveData(): WorldState {
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
    const s = this.state.cameraStates[id];
    if (s) {
      return s;
    }
    const d = this.defaultCameras[id];
    const c = createCameraState();
    return {
      position: {
        x: d?.position?.x || c.position.x,
        y: d?.position?.y || c.position.y,
        z: d?.position?.z || c.position.z,
      },
      rotation: {
        x: d?.rotation?.x || c.rotation.x,
        y: d?.rotation?.y || c.rotation.y,
        z: d?.rotation?.z || c.rotation.z,
      },
      scale: {
        x: d?.scale?.x || c.scale.x,
        y: d?.scale?.y || c.scale.y,
        z: d?.scale?.z || c.scale.z,
      },
      type: d?.type || c.type,
      depth: d?.depth || c.depth,
      width: d?.width || c.width,
      height: d?.height || c.height,
      fit: d?.fit || c.fit,
      background: d?.background || c.background,
      color: d?.color || c.color,
      spawnedEntities: this.deepCopy(d?.spawnedEntities || c.spawnedEntities),
      entities: this.deepCopy(d?.entities || c.entities),
    };
  }

  addCamera(cameraId: string, cameraState?: CameraState): void {
    this.state.cameraStates[cameraId] =
      cameraState || this.getOrCreateCameraState(cameraId);
    this.events.onAddCamera.emit({
      cameraId,
      cameraState: this.state.cameraStates[cameraId],
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
  ): void {
    const camera = this.getOrCreateCameraState(cameraId);
    camera.spawnedEntities.push(entityId);
    camera.entities[entityId] =
      entityState || camera.entities[entityId] || createEntityState();
    this.events.onSpawnEntity.emit({
      entityId,
      cameraId,
      entityState: camera.entities[entityId],
    });
  }

  spawnEntities(entityIds: string[], cameraId?: string): void {
    entityIds.map((entityId) => this.spawnEntity(entityId, cameraId));
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

  destroyEntities(entityIds: string[], cameraId?: string): void {
    entityIds.map((entityId) => this.destroyEntity(entityId, cameraId));
  }
}
