import { Application, ApplicationOptions, Container } from "pixi.js";
import { Scene } from "./Scene";

export class WorkerApplication {
  _timeView: Float64Array;
  get timeView() {
    return this._timeView;
  }

  _scenes: Scene[] = [];
  get scenes() {
    return this._scenes;
  }

  _app: Application;

  constructor(timeView: Float64Array) {
    this._timeView = timeView;

    this._app = new Application();
  }

  async init(options: ApplicationOptions) {
    await this._app.init({ ...options, autoStart: false });
  }

  async loadScene(sceneCtr: typeof Scene) {
    const scene = new sceneCtr(this._app);
    const children = await scene.onLoad();
    const sceneContainer = new Container();
    for (const child of children) {
      sceneContainer.addChild(child);
    }
    this._app.stage.addChild(sceneContainer);
    this._scenes.push(scene);
  }

  async loadScenes(sceneCtrs: (typeof Scene)[]) {
    await Promise.all(sceneCtrs.map((scene) => this.loadScene(scene)));
  }

  start() {
    for (const scene of this._scenes) {
      scene.onStart();
    }
  }

  update(elapsedTime: number) {
    this._timeView[0] = elapsedTime;
    for (const scene of this._scenes) {
      scene.onUpdate(elapsedTime);
    }
    this._app.render();
  }

  destroy() {
    for (const scene of this._scenes) {
      scene.onDispose();
    }
  }

  resize(width: number, height: number, resolution: number) {
    this._app.renderer.resize(width, height, resolution);
    for (const scene of this._scenes) {
      scene.onResize(width, height, resolution);
    }
  }
}
