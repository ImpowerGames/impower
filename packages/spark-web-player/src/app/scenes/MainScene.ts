import { BoxGeometry } from "three/src/geometries/BoxGeometry.js";
import { MeshNormalMaterial } from "three/src/materials/MeshNormalMaterial.js";
import { Mesh } from "three/src/objects/Mesh.js";
import Scene from "../Scene";

export default class MainScene extends Scene {
  protected _mesh = new Mesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new MeshNormalMaterial()
  );

  override init(): void {
    this.add(this._mesh);
  }

  override update() {
    this._mesh.rotation.x = this.time / 2000;
    this._mesh.rotation.y = this.time / 1000;
  }
}
