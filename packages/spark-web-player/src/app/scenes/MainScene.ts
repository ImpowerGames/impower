import { BoxGeometry } from "three/src/geometries/BoxGeometry.js";
import { MeshNormalMaterial } from "three/src/materials/MeshNormalMaterial.js";
import { Mesh } from "three/src/objects/Mesh.js";
import Scene from "../Scene";

export default class MainScene extends Scene {
  protected _geometry = new BoxGeometry(0.2, 0.2, 0.2);

  protected _material = new MeshNormalMaterial();

  protected _mesh = new Mesh(this._geometry, this._material);

  override async load() {
    return [this._geometry, this._material];
  }

  override init() {
    this.add(this._mesh);
  }

  override update() {
    this._mesh.rotation.x = this.time / 2000;
    this._mesh.rotation.y = this.time / 1000;
  }
}
