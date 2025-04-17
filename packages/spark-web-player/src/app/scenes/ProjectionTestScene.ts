import { Ticker } from "@impower/spark-engine/src/game/core";
import { Texture } from "pixi.js";
import { Scene } from "../Scene";
import { Camera } from "../plugins/projection/camera/camera";
import { Sprite3D } from "../plugins/projection/sprite/sprite";
import { SpriteBillboardType } from "../plugins/projection/sprite/sprite-billboard-type";
import { generateSolidTexture } from "../plugins/texture/utils/generateSolidTexture";

class Bunny extends Sprite3D {
  areaSize = 100;

  speedX = 1;

  speedY = 1;

  speedZ = 1;

  constructor(texture: Texture, camera: Camera, areaSize: number) {
    super(texture, camera);

    this.areaSize = areaSize;
    this.transform.position.set(
      -this.areaSize / 2 + Math.random() * this.areaSize,
      0,
      -this.areaSize / 2 + Math.random() * this.areaSize
    );

    this.speedX = -0.01 + Math.random() * 0.02;
    this.speedY = Math.random() * 6;
    this.speedZ = -0.01 + Math.random() * 0.02;

    // The billboard type is set so the sprite always face the camera.
    this.billboardType = SpriteBillboardType.cylindrical;
  }

  update() {
    this.transform.position.x += this.speedX;
    this.transform.position.y = Math.cos((this.speedY += 0.4)) * 0.05;
    this.transform.position.z += this.speedZ;

    if (this.transform.position.x > this.areaSize / 2) {
      this.speedX *= -1;
      this.transform.position.x = this.areaSize / 2;
    } else if (this.transform.position.x < -this.areaSize / 2) {
      this.speedX *= -1;
      this.transform.position.x = -this.areaSize / 2;
    }
    if (this.transform.position.z > this.areaSize / 2) {
      this.speedZ *= -1;
      this.transform.position.z = this.areaSize / 2;
    } else if (this.transform.position.z < -this.areaSize / 2) {
      this.speedZ *= -1;
      this.transform.position.z = -this.areaSize / 2;
    }
  }
}

export default class ProjectionTestScene extends Scene {
  protected _sprite3D!: Sprite3D;

  protected _bunnies: Bunny[] = [];

  override async onLoad() {
    const texture = generateSolidTexture(this.renderer, 25, 32);

    this._sprite3D = new Sprite3D(texture, this.camera);
    this._sprite3D.tint = 0xff0000;
    this._sprite3D.transform.position.x = 4;
    this._sprite3D.transform.position.y = 2;
    this._sprite3D.transform.position.z = 0;

    // Main Camera
    this.dolly.target.x = 0;
    this.dolly.target.y = 0;
    this.dolly.target.z = 0;
    this.dolly.distance = 3.4;
    this.dolly.angles.x = 8;

    for (let i = 0; i < 500; i++) {
      const bunny = new Bunny(texture, this.camera, 6);
      bunny.tint = Math.random() * 0xffffff;
      this._bunnies.push(bunny);
    }

    // So the sprites can be sorted using z-index.
    this.stage.sortableChildren = true;

    return [...this._bunnies];
  }

  override onUpdate(time: Ticker) {
    const t = time.elapsedTime;
    // this._sprite3D.transform.position.x = Math.sin(t);
    // this._sprite3D.transform.position.y = Math.sin(t);
    // this._sprite3D.transform.position.z = Math.sin(t);

    // this._sprite3D.transform.rotationQuaternion.x = Math.cos(t); // Forward/back tilt
    this._sprite3D.transform.rotationQuaternion.y = Math.sin(t); // Left/right tilt

    for (let bunny of this._bunnies) {
      bunny.update();
    }
  }
}
