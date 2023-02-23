import { Material, Mesh3D as _Mesh3D, StandardMaterial } from "pixi3d/pixi7";
import { CylinderGeometry, CylinderGeometryOptions } from "./CylinderGeometry";

export class Mesh3D extends _Mesh3D {
  /**
   * Creates a new uv sphere mesh with the specified material.
   * @param material The material to use.
   * @param options The options used when creating the geometry.
   */
  static createCylinder(
    material: Material = new StandardMaterial(),
    options: CylinderGeometryOptions = {}
  ): Mesh3D {
    return new Mesh3D(CylinderGeometry.create(options), material);
  }
}
