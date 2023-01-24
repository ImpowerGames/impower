import { Camera, Vec3 } from "pixi3d";

export class SparkCamera extends Camera {
  distanceFromCamera(point: Float32Array): number {
    return Vec3.distance(point, this.worldTransform.position.array);
  }
}
