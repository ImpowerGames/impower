import { Mesh3D as _Mesh3D } from "pixi3d/pixi7";
import { Material } from "./Material";
import { RingGeometry, RingGeometryOptions } from "./RingGeometry";
import { StandardMaterial } from "./StandardMaterial";

export class Mesh3D extends _Mesh3D {
  override material?: Material | undefined;

  /**
   * Creates a new uv circle mesh with the specified material.
   * @param material The material to use.
   * @param options The options used when creating the geometry.
   */
  static createRing(
    material: Material = new StandardMaterial(),
    options: RingGeometryOptions = {}
  ): Mesh3D {
    return new Mesh3D(RingGeometry.create(options), material);
  }
}
