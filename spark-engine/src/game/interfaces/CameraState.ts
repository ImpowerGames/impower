import { EntityState } from "./EntityState";
import { Transform } from "./Transform";
import { View } from "./View";

export interface CameraState extends Transform, View {
  spawnedEntities: string[];
  entities: Record<string, EntityState>;
}
