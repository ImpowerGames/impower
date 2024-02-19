import { Manager } from "../../../core/classes/Manager";
import { clone } from "../../../core/utils/clone";
import { CameraState } from "../types/CameraState";
import { EntityState } from "../types/EntityState";
import { createCameraState } from "../utils/createCameraState";
import { createEntityState } from "../utils/createEntityState";
import {
  DestroyCameraMessage,
  DestroyCameraMessageMap,
} from "./messages/DestroyCameraMessage";
import {
  DestroyEntityMessage,
  DestroyEntityMessageMap,
} from "./messages/DestroyEntityMessage";
import {
  SpawnCameraMessage,
  SpawnCameraMessageMap,
} from "./messages/SpawnCameraMessage";
import {
  SpawnEntityMessage,
  SpawnEntityMessageMap,
} from "./messages/SpawnEntityMessage";

export interface WorldConfig {}

export interface WorldState {}

export type WorldMessageMap = DestroyCameraMessageMap &
  DestroyEntityMessageMap &
  SpawnCameraMessageMap &
  SpawnEntityMessageMap;

export class WorldManager extends Manager<WorldState, WorldMessageMap> {
  protected _mainCamera: string = "";

  protected _activeCameras: string[] = [];

  protected _cameraStates: Record<string, CameraState> = {};

  private getCameraState(cameraId?: string): CameraState | undefined {
    const id = cameraId || this._mainCamera;
    if (this._cameraStates[id]) {
      return this._cameraStates[id];
    }
    return undefined;
  }

  private getOrCreateCameraState(cameraName?: string): CameraState {
    const id = cameraName || this._mainCamera;
    const state = this._cameraStates[id];
    if (state) {
      return state;
    }
    const d = this._context?.["camera"]?.[id];
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
    entityName: string,
    cameraId?: string
  ): EntityState {
    const cameraState = this.getCameraState(cameraId);
    const state = cameraState?.entities[entityName];
    if (state) {
      return state;
    }
    const d = this._context?.["entity"]?.[entityName];
    const c = createEntityState();
    return clone({
      position: d?.position || c.position,
      rotation: d?.rotation || c.rotation,
      scale: d?.scale || c.scale,
    });
  }

  spawnCamera(cameraId: string, cameraState?: CameraState): void {
    const s = cameraState || this.getOrCreateCameraState(cameraId);
    this._cameraStates[cameraId] = s;
    this.emit(SpawnCameraMessage.type.request({ id: cameraId, ...s }));
  }

  destroyCamera(cameraId: string): void {
    delete this._cameraStates[cameraId];
    this.emit(DestroyCameraMessage.type.request({ id: cameraId }));
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
    this.emit(
      SpawnEntityMessage.type.request({ id: entityId, camera: cameraId, ...s })
    );
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
    this.emit(
      DestroyEntityMessage.type.request({ id: entityId, camera: cameraId })
    );
  }
}
