import { Ticker } from "@impower/spark-engine/src/game/core";
import { Texture } from "pixi.js";
import { Scene } from "../Scene";
import { Camera } from "../plugins/projection/camera/camera";
import { AnimatedSprite3D } from "../plugins/projection/sprite/animated-sprite";
import { Sprite3D } from "../plugins/projection/sprite/sprite";
import { SpriteBillboardType } from "../plugins/projection/sprite/sprite-billboard-type";
import { generateAnimatedSVGTextures } from "../plugins/svg/utils/generateAnimatedSVGTextures";
import { parseSVG } from "../plugins/svg/utils/parseSVG";

class Bunny extends AnimatedSprite3D {
  areaSize = 100;

  speedX = 1;

  speedY = 1;

  speedZ = 1;

  constructor(textures: Texture[], camera: Camera, areaSize: number) {
    super(textures, camera);

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
    this.billboardType = SpriteBillboardType.none;
  }

  updatePosition() {
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
    // Parse the svg string
    const svgEl = parseSVG(svg);

    // Load the animation frames
    const textures = generateAnimatedSVGTextures(this.renderer, svgEl);

    // Main Camera
    this.dolly.target.x = 0;
    this.dolly.target.y = 0;
    this.dolly.target.z = 0;
    this.dolly.distance = 10;
    this.dolly.angles.x = 8;

    for (let i = 0; i < 500; i++) {
      const bunny = new Bunny(textures, this.camera, 6);
      bunny.tint = Math.random() * 0xffffff;
      // bunny.play();
      this._bunnies.push(bunny);
    }

    // So the sprites can be sorted using z-index.
    this.stage.sortableChildren = true;

    return [...this._bunnies];
  }

  pixiTicker = { deltaTime: 0 };

  override onUpdate(time: Ticker) {
    this.pixiTicker.deltaTime = time.deltaFrames;
    for (let bunny of this._bunnies) {
      bunny.updatePosition();
      bunny.update(this.pixiTicker as any);
    }
  }
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M132.2 166.9C132.2 166.3 133.3 164.6 134.8 164.6 138 164.7 141.5 165.3 144.9 166.1 147.2 166.6 147.8 168.7 147.4 170.3 139 205.8 143.7 245.1 148 252.6 149.6 255.3 145.7 256.8 143.5 254.3 117.5 224.6 130.9 171.4 132.2 166.9Z;M135.5 165.5C135.3 163.8 135.8 162 137.6 162 141.1 162.2 148.2 162 151.5 161.4 153.8 160.9 153.6 162.4 153.9 165.7 156 188.2 161.5 220.1 174.2 249.9 176 254.1 171.8 255.4 169.9 253.2 143.5 223.5 136 171.1 135.5 165.5Z;M138.9 160.9C138.3 159.4 139.1 157 140.9 157.1 145.5 157.1 150.7 154.8 153.1 154.4 155.4 154 156.9 156.9 157.4 158.4 162.5 174.4 183.7 195.7 224.4 214.6 228.5 216.6 226.5 220 223.7 219.4 181.4 211 149.4 187.4 138.9 160.9Z;M139.3 167.9C138.6 166.4 139.8 165.4 141.5 164.8 146 163.3 148.7 161.9 152.6 159.6 154.7 158.4 155.6 160.8 156.1 162.4 160.5 178.2 194 184.2 202 145.9 202.9 141.9 207.1 143.1 207.2 145.6 210.4 191.5 156.8 209.8 139.3 167.9Z;M130.9 169.1C130.8 167.4 129.9 165 131.6 164.7 134.9 164.1 140 163.5 145.3 163.8 148.4 163.9 148.3 165.9 148.3 169 148.7 200.7 161.5 220.9 177.2 234.8 179.3 236.6 176.7 239.7 173.7 238.1 153.4 227 133.8 209.3 130.9 169.1Z;M109.1 147.4C113.6 146.6 111.8 147.2 112.3 148.8 113.6 153.3 113.8 159.9 113.8 162.1 113.7 165.1 113.2 166.1 111.2 165.8 98.2 163.3 94.8 171.7 105 202.2 106 204.9 102.4 205.8 100.8 203.1 71.8 152.2 104.7 148.1 109.1 147.4Z;M106.3 135.9C107.7 136.7 108.1 137.2 108.9 138.9 109.6 140.5 111.9 146.9 112.2 149 112.4 151.1 112 152.7 110.8 152 90.2 140.5 73.1 142.9 59 159.4 57.1 161.6 53.1 161.3 54.3 158.4 69.9 119.3 104.9 135.1 106.3 135.9Z;M114.8 158.6C116.4 156.6 118 155.6 119.8 156.4 121.6 157.3 131 161.5 134.3 162.2 136.6 162.8 134.6 168.9 133.5 170.2 118 190.2 111.8 205 104.9 247.1 104.4 250.2 99.9 250.3 99.7 247 95.8 193.2 113.2 160.5 114.8 158.6Z;M132.2 166.9C132.2 166.3 133.3 164.6 134.8 164.6 138 164.7 141.5 165.3 144.9 166.1 147.2 166.6 147.8 168.7 147.4 170.3 139 205.8 143.7 245.1 148 252.6 149.6 255.3 145.7 256.8 143.5 254.3 117.5 224.6 130.9 171.4 132.2 166.9z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M118.4 161.6C118.7 159.7 119.5 159.6 120.9 159.6 125.6 159.9 129.3 160.5 132.5 162.5 133.6 163.1 134.4 163.4 134.2 164.7 124.9 207.9 164.3 225.7 168.3 227.4 171.8 228.8 170.8 232.8 166.9 232.3 137.1 228.3 111.6 207.6 118.4 161.6Z;M116.5 155.8C118.3 154.9 120.3 154.2 121.6 154.8 126 156.9 129.6 160 132.3 162.5 133.3 163.4 134.1 164.9 133 165.4 94.7 184.3 101 203.1 101.1 215.8 101.1 218.8 97.8 218.9 96.8 216.3 86 189.6 100.8 163.5 116.5 155.8Z;M110.3 132.7C112.7 133.1 113.4 133.2 114.4 133.9 118.2 136.9 121.1 143.4 122.7 146.9 123.3 148.1 124.8 152.3 123.6 151.6 95 134.2 78 157.5 72.8 163.8 70.9 166.2 66.4 165.4 67.2 162.8 76.4 133.5 96.4 129.9 110.3 132.7Z;M120.2 161.6C122.6 159.5 125.3 158.5 127.8 160.1 130.2 161.6 132.8 164.2 134.8 166.6 136.9 169 137 171.2 136.1 172.2 117.1 194.2 114.4 228.3 122.6 247.9 123.4 249.9 118.8 252.2 117.2 249.9 99.1 222.8 107.4 172.9 120.2 161.6Z;M115.6 163.6C116.2 161.8 118.1 162 119.5 162.3 120.9 162.6 130.1 165.8 131.9 166.9 133.8 168 133.6 169.5 133.1 170.7 120.4 206.2 131.7 229.6 137.5 249.9 138.2 252.4 134.2 253.9 132.4 251.4 107.9 217.6 109.4 183.4 115.6 163.6Z;M114.3 164.4C114.7 162.6 114.8 160.9 117.1 161.2 119.3 161.4 130.1 162.1 131.7 162.5 133.2 163 132.7 164.7 132.5 166 125.7 211.8 151.8 245.5 153.1 248.1 154.5 250.5 151.9 253.7 148.9 250.9 126.9 229.8 108.7 188.7 114.3 164.4Z;M116 156.8C115.6 154.9 117 153.5 118.9 153.1 120.7 152.7 129 152.7 132.1 152.9 135.1 153.1 136.8 154 137.8 157.1 151.1 199.9 194.7 209.2 201.3 214.4 203.9 216.6 203.6 217.7 199.5 217.9 172 219.4 121.4 188.1 116 156.8Z;M120.2 159.4C120.4 158.7 121.1 156.7 123.6 157.9 127.8 160 132.8 161.4 137.4 161.6 138.6 161.7 139.2 163.5 139 164.8 131.9 208.7 167.9 207.6 177.6 191.7 179.8 188 182.8 190.8 181.4 194.5 169.4 227.6 106.8 222.1 120.2 159.4Z;M118.4 161.6C118.7 159.7 119.5 159.6 120.9 159.6 125.6 159.9 129.3 160.5 132.5 162.5 133.6 163.1 134.4 163.4 134.2 164.7 124.9 207.9 164.3 225.7 168.3 227.4 171.8 228.8 170.8 232.8 166.9 232.3 137.1 228.3 111.6 207.6 118.4 161.6z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M160.3 99.5C158 98 155.4 96.9 153.5 98.1 150.6 99.8 150.3 107.8 151.2 110.7 151.6 111.9 152 112.4 152.3 113 161.3 129.3 161.6 133.2 160.7 149.9 160.5 153.2 164.7 153.3 166.1 149.8 179.4 118 162.7 101.1 160.3 99.5Z;M155.1 115.6C158.6 112.4 162 107.6 160.6 99.6 159.2 91.6 156.1 86.6 152.5 88.8 148.9 91 149 93.5 144.7 98.1 140.4 102.7 132.6 107.7 120.6 110 117.4 110.6 117.4 117.9 121.2 118.2 143.3 120 151.6 118.8 155.1 115.6Z;M150.8 99.8C158.3 102.6 162.5 96.7 163.7 94.8 164.9 92.9 165.2 86.1 163.1 83.1 160.3 79.3 149.7 79.5 146.7 79.5 113.9 79.2 114.4 62.1 107.5 56.1 105.1 54 102.8 54.5 102.9 58.4 103.7 95.8 143.3 96.9 150.8 99.8Z;M119 99.1C133.1 106.7 145.6 109.5 153.6 107.3 161.7 105.2 159.4 91.8 155.9 89.3 153.3 87.3 145.6 87.7 142.6 87.7 106.6 88 116.5 58.5 116.1 52.2 115.9 49.1 113.4 48.7 111 51.2 97.1 66.3 104.8 91.5 119 99.1Z;M158.6 113.8C161.6 111.2 162.5 105.4 159.2 100 155.9 94.5 147.3 92.5 144.8 96.2 139.5 104.4 130.1 99.7 128.1 98.7 126.1 97.7 122.7 97 118.1 93.6 115.5 91.6 114.8 92.7 113.9 96.5 108.8 117.7 155.6 116.5 158.6 113.8Z;M160.4 89.9C158.4 89.4 156 89.4 154.5 91.6 152.6 94 152.6 100.7 153.4 103.1 154.1 105.5 154.2 104.5 154.8 104.6 170.1 107.9 173 124.4 174.8 142.2 175.1 145.4 178.7 146.9 179.7 143.2 190.2 103.9 162.3 90.4 160.4 89.9Z;M157.2 81C154.6 80.6 153.3 80.7 152.7 83 152.1 85.3 151.4 93.3 152.3 96.2 152.7 97.4 153.1 97.4 154.7 97.1 172.9 92.9 189.9 112.3 188.5 133.9 188.3 137.2 193.6 137.5 194.2 133.7 203 80.8 159.8 81.3 157.2 81Z;M160.4 83.5C158.8 83.7 156.4 84.4 155.1 87.2 153.9 90.1 153.8 95 154.8 98 155.2 99.2 155.7 99.2 156.4 99 176 93.6 192.9 104.3 186.7 130.7 186 133.8 189.8 135.9 191.2 132.3 213.9 75.2 162 83.3 160.4 83.5Z;M160.3 99.5C158 98 155.4 96.9 153.5 98.1 150.6 99.8 150.3 107.8 151.2 110.7 151.6 111.9 152 112.4 152.3 113 161.3 129.3 161.6 133.2 160.7 149.9 160.5 153.2 164.7 153.3 166.1 149.8 179.4 118 162.7 101.1 160.3 99.5z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M112.4 83.7C109.9 82.6 106 83.7 105 88.3 96.9 124.8 115.8 155.5 123.6 157.3 127.9 158.4 145.9 162.2 149.9 160.6 152.3 159.6 153.7 157 153 153.1 149.6 135.5 148.2 130.1 151 105.7 151.6 100.6 151.1 93.5 145.9 93.9 126.9 95.2 122.6 90.1 112.4 83.7Z;M112.3 77.9C108.8 76.7 105.8 81.9 105.3 85.5 99.7 131 123.4 155 132.5 157.9 136.7 159.2 146.4 160.7 150.4 159.2 152.9 158.2 153.7 155.3 153.2 151.4 150.9 134.2 150.1 125.4 152 100.4 152.4 95.3 152.8 85.5 147.6 85.2 133.6 84.3 122.2 81.2 112.3 77.9Z;M119.9 75.8C116.3 75.3 109.3 77.9 108.7 81.3 102.6 114.1 124.9 154 135 155.5 139.7 156.3 151.7 153.1 154.7 150.1 156.6 148.2 157.4 145.9 156.4 142 152 124.3 151.3 119.9 154.9 94.9 155.7 89.8 158.5 76.2 153.3 75.9 139.2 75 131.9 77.5 119.9 75.8Z;M119.6 83.1C115.9 82.7 108.5 83.9 107.7 87.4 99.4 124.1 123.8 153.8 131.5 161.4 136.9 166.6 151.8 158.5 154.7 155.3 156.3 153.5 156.9 151.6 156.4 149.1 153.8 133.9 151.7 123.1 153.8 104.1 154.4 99 156.5 87.8 150.3 86.1 141.7 83.7 135.4 85.1 119.6 83.1Z;M121.6 89.9C113.4 89.6 110.8 94.2 110.4 97.7 106.5 134.5 114.9 151.7 123.2 161 126.8 165 143.1 162.1 147 160.6 149.5 159.6 153.2 156.8 152.4 153 148.7 134.1 148.4 125.1 152.3 107.4 153.4 102.4 154.8 96.1 148.6 94.4 140.1 92 137.5 90.4 121.6 89.9Z;M122.9 77.3C115.4 74.2 112.3 79.5 111.2 82.7 104 105.2 107.2 140.4 116.8 154.9 119.8 159.4 137.7 158.6 141.7 157 144.2 156 146.8 155.1 146.4 151.1 144.7 131.3 148.4 117.1 152.3 98.1 153.3 93 153.9 86.7 147.8 84.9 141.7 83.2 136.5 83 122.9 77.3Z;M121.5 63.6C115.5 58 108.2 64.8 107 68 98.3 90.7 106 133.1 116.3 147.5 119.4 151.9 138.5 149.7 142.4 148.2 144.9 147.2 146.3 144.7 145.8 140.8 143.8 122.9 146.7 106.4 150.6 89.4 151.7 84.4 153.1 82 144.1 78.3 132.8 73.6 130.5 71.8 121.5 63.6Z;M113.4 75.1C107 72.3 102.9 75.8 101.7 80.4 92.8 113.7 112.4 148.7 120 153.7 123.8 156.2 141.5 157.6 146 155.8 148.5 154.9 149.3 152.4 148.5 148.6 144.6 131.4 145.8 122.5 150.9 97.9 151.9 92.9 150.2 88.1 145 88.4 125.9 89.8 124.8 79.7 113.4 75.1Z;M112.4 83.7C109.9 82.6 106 83.7 105 88.3 96.9 124.8 115.8 155.5 123.6 157.3 127.9 158.4 145.9 162.2 149.9 160.6 152.3 159.6 153.7 157 153 153.1 149.6 135.5 148.2 130.1 151 105.7 151.6 100.6 151.1 93.5 145.9 93.9 126.9 95.2 122.6 90.1 112.4 83.7z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M104.5 89.3C104.5 84 107.2 82.9 110.8 84.2 115.2 85.8 118.7 93.5 119 100 119.3 106.5 116.5 120.1 111.4 129.1 106.3 138.1 89.1 151.3 85.5 146.9 81.9 142.5 104.4 133.9 104.5 89.3Z;M107.5 96.1C102.7 89.3 106.5 80.6 111.1 80.6 114.6 80.5 118.6 84.2 123.7 88.2 130.2 93.4 137.2 105.5 139.7 112.6 142.2 119.6 146.5 141 142.1 142.7 137.8 144.4 137.2 117.8 107.5 96.1Z;M107.5 96.1C102.7 89.3 106.8 79.7 111.3 79.6 114.9 79.5 128.2 80.4 133.8 84.3 139.5 88.2 140.8 88.9 149.4 99.2 158 109.6 170 136.2 165.6 137.9 161.3 139.6 138.3 84.7 107.5 96.1Z;M106.7 105.8C102 98.9 106 89.3 110.6 89.2 114.1 89.2 127 89.7 133.1 93.9 139.2 98.2 142.1 99 149.8 109.4 157.5 119.8 153.9 151.2 150.4 150.5 146.9 149.7 143.9 95.3 106.7 105.8Z;M108.3 105.3C103.6 98.5 108.1 93.8 112.6 93.8 116.1 93.7 125.9 99.3 129.4 107 133 114.8 133.9 119.6 134.1 131.4 134.3 143.1 130.3 156.9 125.8 156.6 121.4 156.4 135.2 112.9 108.3 105.3Z;M109.9 80.2C110.7 80.7 111 81.8 110.8 82.7 110.3 85.1 108.8 93.4 107.2 95.8 106.3 97.3 105.6 97.3 102.4 94.3 74.3 67.5 90.3 37 94.2 38.3 98.2 39.5 86.3 65.7 109.9 80.2Z;M106.8 61.4C107.7 61.8 108 63 107.8 63.8 107.3 66.3 103.5 75.9 102 78.3 101 79.7 99.4 80.5 97.2 76.7 78.3 44.9 95.7 13.5 99.9 15.8 104.2 18 93.3 38.2 106.8 61.4Z;M100.5 77.2C100.9 77.4 101.2 78.7 101 79.6 100.5 82 95.8 89.7 94.2 90.6 92.6 91.6 92.2 92.9 89.3 89.7 57.5 54.3 102.3 32.2 105.6 36.4 108.9 40.5 75.4 56.3 100.5 77.2Z;M104.5 89.3C104.5 84 107.2 82.9 110.8 84.2 115.2 85.8 118.7 93.5 119 100 119.3 106.5 116.5 120.1 111.4 129.1 106.3 138.1 89.1 151.3 85.5 146.9 81.9 142.5 104.4 133.9 104.5 89.3z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M114 83.7C124.1 89.8 121.9 93.8 136.2 94.6 137.8 94.7 143.9 94.9 144.7 92.1 145.3 89.7 143 88.3 142.1 87.8 140 86.8 134.3 87.1 132.1 86.5 127.8 85.4 122.7 82 120.2 81.2 115.9 79.8 114 83.7 114 83.7Z;M115.1 78.7C115.9 80.6 126.6 84.1 142.1 85.1 143.6 85.2 148.2 85.5 147.2 83 146.2 80.6 143.6 79.7 142.6 79.3 140.5 78.4 137 78.7 134.1 78.2 129.7 77.4 125.6 74.9 121.1 75 116.5 75.1 115.1 78.7 115.1 78.7Z;M119.6 75.7C120.4 77.6 131.4 75.4 146.9 76.3 148.5 76.4 152.8 75.9 151.8 73.4 150.8 71 148.2 70.1 147.2 69.7 145.1 68.8 140.2 69.1 136.7 69.2 132.3 69.4 131.9 68.3 127.4 68.5 120.2 68.7 119.6 75.7 119.6 75.7Z;M118.4 81.4C119.2 83.2 133.9 83.4 146.7 86.1 148.2 86.4 152.9 86.6 151.9 84.1 150.9 81.6 148.6 79.9 147.6 79.6 145.4 78.7 140.5 79.2 137.1 78.5 132.6 77.5 131.5 75.4 127 75.6 119.8 75.8 118.4 81.4 118.4 81.4Z;M118.6 89.3C119.4 91.2 130.7 88.2 143.3 91.2 146.1 91.9 152.4 93.6 152.3 91.1 152.2 88.5 148.9 87 148 86.6 145.8 85.7 140.9 86.2 137.5 85.5 133 84.5 131.3 84.1 126.8 84.2 119.6 84.4 118.6 89.3 118.6 89.3Z;M118.1 74.3C118.9 76.1 130.6 80.8 142.8 83.4 145.6 84 149.3 86.8 149.2 84.3 149.1 81.7 148 80.8 147 80.4 144.8 79.5 138.6 77.5 135.2 76.6 131.7 75.6 128.7 71.7 125.6 71.6 121.3 71.4 118.1 74.3 118.1 74.3Z;M117 62C128.3 65.5 124.8 70.4 138.1 76.1 141 77.3 145.9 80.8 147.2 78.7 148.6 76.3 145.7 72.5 144.8 72.1 142.6 71.3 137.4 68.9 134.9 67.4 131.8 65.4 126.9 58.8 123.7 58.7 119.4 58.5 117 62 117 62Z;M113.2 73.5C119.9 78.2 123 88 140.4 89.4 141.9 89.5 146.6 88.2 145.6 85.3 145.1 83.7 143.4 82.7 141.7 81.9 139.6 81 137.5 81.1 135.4 80.5 131.1 79.4 122.7 72.8 120.2 72 115.9 70.6 113.2 73.5 113.2 73.5Z;M114 83.7C124.1 89.8 121.9 93.8 136.2 94.6 137.8 94.7 143.9 94.9 144.7 92.1 145.3 89.7 143 88.3 142.1 87.8 140 86.8 134.3 87.1 132.1 86.5 127.8 85.4 122.7 82 120.2 81.2 115.9 79.8 114 83.7 114 83.7z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M133.3 34.6C137.1 44.8 147.4 36.5 152.9 49.1 156.2 49.3 162.6 56.5 162.8 61.8 163.1 76.1 153.6 77.6 152.9 78.6 152.1 79.5 146.8 86.2 135.2 85.8 123.6 85.4 114.5 77.1 114.8 67.3 114.9 66 115 64.8 115.4 63.7 115.7 62.5 116.1 61.4 116.7 60.4 117.3 59.3 112.9 59.1 110.3 53.2 108.3 48.7 112.5 48 115.3 48.3 113.3 45.2 112.4 42.1 113.6 38.7 115 34.5 122.2 38.6 127 40 127.3 34.6 131.9 30.8 133.3 34.6Z;M130.4 19.4C141.8 25.8 149.2 24.2 151.6 38 154.3 38.2 157.9 42.1 159.2 47 162.2 58.1 149.2 66.5 148.5 67.6 147.8 68.6 143.2 76.6 133.4 76.3 123.5 76 115.9 66.3 116.3 54.7 116.3 54 116.5 51.8 116.8 50.5 117.1 49.1 117.4 47.8 117.9 46.6 118.4 45.3 114.7 46.7 112.8 45.1 109.3 42.1 112.3 36.6 116.3 34.1 115.8 34 113.4 33.8 112.8 32.6 110.2 27.6 120.2 22.5 126.3 25.4 124.3 20.6 125.6 16.7 130.4 19.4Z;M129 10.5C139.4 14.2 149.3 17.4 153.8 27.9 156.4 28.1 163.4 34.5 163.6 40.5 164.1 52.4 154.6 56.3 153.8 57.4 153 58.5 147.6 66.5 136.1 66.1 124.5 65.7 115.4 55.9 115.8 44.3 115.8 43.6 116.1 41.5 116.4 40.1 116.7 38.8 117.2 37.5 117.7 36.2 118.3 35 113.3 39.9 111.5 38.4 107.8 35.3 112 28.6 115.2 25.9 114.1 26 112.4 25.3 111.8 24.3 108.7 19.5 118.8 13.9 125.6 15.7 122.8 12.7 122.4 8.2 129 10.5Z;M136.8 18.7C143.1 29.8 154.2 23.6 156.7 37.4 159.3 37.6 162.9 41.5 164.2 46.4 167.2 57.5 154.2 65.8 153.5 66.9 152.8 68 148.2 76 138.4 75.7 128.5 75.3 120.9 65.7 121.3 54.1 121.3 53.3 121.5 51.2 121.8 49.9 122.1 48.5 122.5 47.2 123 46 123.5 44.7 118.6 44.4 116.8 40.2 114.6 34.9 119.1 34.9 121.5 33.7 120.9 32.8 118 28.6 117.9 26.4 117.5 21 126.3 23 131.3 24.8 129.8 20.7 134.8 15.3 136.8 18.7Z;M138.1 35.2C142.7 46.5 152.7 38.1 157.5 49.4 160.9 49.6 166.4 56.1 166.5 61.5 166.9 75.7 157.4 77.3 156.6 78.2 155.8 79.1 150.5 85.8 138.9 85.4 127.4 85 118.2 76.7 118.6 66.9 118.6 65.6 118.8 64.4 119.1 63.3 119.4 62.1 120.1 61.1 120.5 60 120.7 59.3 115.1 58.8 113.7 53.9 112.1 48.5 115.8 48.6 120.6 49.2 119.3 47.4 116.5 42.6 117.7 39.2 119.3 34.6 125.2 40.1 131.4 40.7 129.9 36.7 136.7 31.7 138.1 35.2Z;M140.2 21.7C146.6 32.8 158.4 26.2 160.9 40 163.6 40.2 167.2 44.1 168.5 49 171.5 60.1 158.4 68.4 157.7 69.5 157.1 70.6 152.5 78.6 142.6 78.3 132.8 77.9 125.1 68.3 125.5 56.7 125.6 55.9 125.8 53.8 126 52.5 126.3 51.1 126.7 49.8 127.2 48.6 127.7 47.3 123.7 49 121.7 47.7 117.7 45.2 121.6 38.6 125.6 36.1 125.1 36 122.7 35.8 122.1 34.6 119.5 29.5 129.5 24.4 135.6 27.4 134.1 23.3 138.3 18.3 140.2 21.7Z;M140.9 14C149.1 15.2 160 20.1 164.1 30.1 166.6 30.5 173.3 37.3 173.8 43.1 174.7 54.9 165 58.5 164.2 59.6 163.4 60.7 158 68.6 146.5 68.2 134.9 67.8 125.8 58.1 126.2 46.5 126.2 45.8 126.5 43.6 126.8 42.3 127.1 40.9 127.6 39.6 128.1 38.4 128.7 37.2 123.9 41.5 121.5 39.6 117.8 36.4 122 29.7 125.2 27 124.2 27.1 122.5 26.4 121.9 25.4 118.8 20.6 129.5 16.8 136.1 18.2 133 15.5 136.3 13.2 140.9 14Z;M138.4 21.9C144.8 33.1 156 26.4 158.5 40.3 161.1 40.5 165.5 45 166.1 50 167.4 61.1 156.1 68.7 155.4 69.8 154.7 70.9 150.1 78.9 140.3 78.6 130.4 78.2 122.8 68.5 123.2 57 123.2 55.5 123.4 54.1 123.7 52.7 124 51.4 124.6 49.5 124.9 48.8 125.4 47.6 120.5 46.5 119.5 45.5 116.1 42.3 119.2 38.2 123.2 35.8 122.4 35.2 120.3 33.8 119.7 32.7 117.2 27.6 127.1 24.7 133.1 27.6 131.7 23.5 136.5 18.5 138.4 21.9Z;M133.3 34.6C137.1 44.8 147.4 36.5 152.9 49.1 156.2 49.3 162.6 56.5 162.8 61.8 163.1 76.1 153.6 77.6 152.9 78.6 152.1 79.5 146.8 86.2 135.2 85.8 123.6 85.4 114.5 77.1 114.8 67.3 114.9 66 115 64.8 115.4 63.7 115.7 62.5 116.1 61.4 116.7 60.4 117.3 59.3 112.9 59.1 110.3 53.2 108.3 48.7 112.5 48 115.3 48.3 113.3 45.2 112.4 42.1 113.6 38.7 115 34.5 122.2 38.6 127 40 127.3 34.6 131.9 30.8 133.3 34.6z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M156.3 48.1C156.6 48.4 160.5 46.7 161 43.7 161.3 41.5 159.1 41.1 157.8 42.5 156.6 43.8 156.1 47.8 156.3 48.1Z;M154.7 36.2C155 36.5 158.4 38.2 160.5 36.7 162 35.7 160.7 33.5 159.3 33.6 158 33.8 154.7 35.9 154.7 36.2Z;M156.7 25.3C157 25.6 159.1 30.2 162 30 163.3 29.9 164.4 28 162.9 26.8 160 24.4 156.5 25 156.7 25.3Z;M160 36.1C160.3 36.5 167.1 36.7 167.1 33.7 167.1 32.3 166.9 30.9 165 31.5 161.3 32.6 159.8 35.8 160 36.1Z;M161.5 48.6C161.9 49 164.9 45.7 164.3 42.7 164.1 41.5 162.5 41.1 161.7 42.3 159.7 45.2 161.3 48.3 161.5 48.6Z;M164 38.7C164.3 39 170.5 39.3 170.5 36.3 170.6 34.9 169.6 33.7 167.8 35 164.7 37.2 163.8 38.4 164 38.7Z;M167.3 28.3C167.7 28.7 171.9 31.1 174.3 29.2 175.3 28.4 175.6 25.9 173.2 26.2 169.5 26.7 166.9 27.5 167.3 28.3Z;M161.6 39.1C161.9 39.4 167 38.7 168.6 37.1 169.2 36.5 170.1 34.2 167.3 33.8 164.8 33.4 161.3 38.7 161.6 39.1Z;M156.3 48.1C156.6 48.4 160.5 46.7 161 43.7 161.3 41.5 159.1 41.1 157.8 42.5 156.6 43.8 156.1 47.8 156.3 48.1z"/>
  </path>
  <path stroke="#fff" stroke-width="2">
    <animate attributeName="d" calcMode="spline" dur="0.8s" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1;0 0 1 1" keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1" repeatCount="indefinite" values="M154.4 47.1C154.8 47.3 154.8 46.8 156.2 43.2 157.4 40.4 156.6 36.9 153.4 37.4 150 37.8 153.3 46.6 154.4 47.1Z;M152.7 36.3C153.1 36.5 155.1 33.4 158.9 33.5 161.9 33.5 160.8 29 157.3 29.1 153.9 29.1 151.6 35.8 152.7 36.3Z;M154.3 25.3C154.7 25.5 159.9 24.5 162.4 25.1 165.3 25.8 166.4 21.1 161.4 20.9 156.7 20.7 153.3 24.5 154.3 25.3Z;M157.7 35.1C158.1 35.3 159.4 34.5 162.7 32.7 165.4 31.2 165.2 27.6 162.1 28 158.6 28.5 156.6 34.6 157.7 35.1Z;M159.1 47.2C159.5 47.4 160.4 45.8 160.4 41.9 160.4 39.1 158.4 37 156.4 37.9 153.2 39.1 158 46.8 159.1 47.2Z;M162.1 38.3C162.6 38.5 163.7 36 166.9 33.9 169.2 32.4 168.3 29.6 165.2 30 161.8 30.5 161.1 37.8 162.1 38.3Z;M164.7 27.8C165.1 28 168.3 26.6 172.1 26.1 174.7 25.8 173.5 21.3 170.4 21.8 167 22.2 163.6 27.3 164.7 27.8Z;M159.6 38.1C160.1 38.3 162.8 36.2 165.4 33.5 167.7 31.2 166.3 29.2 163.4 29.4 160 29.7 158.6 37.6 159.6 38.1Z;M154.4 47.1C154.8 47.3 154.8 46.8 156.2 43.2 157.4 40.4 156.6 36.9 153.4 37.4 150 37.8 153.3 46.6 154.4 47.1z"/>
  </path>
</svg>
`.trim();
