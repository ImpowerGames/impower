import { DOMAdapter, WebWorkerAdapter } from "pixi.js";
import "pixi.js/unsafe-eval";
import { Scene } from "../Scene";
import { WorkerApplication } from "../WorkerApplication";

DOMAdapter.set(WebWorkerAdapter);

let _workerApplication: WorkerApplication;
let _initialScenes: (typeof Scene)[] = []; // [SVGTestScene]

onmessage = async (e) => {
  const message = e.data;
  if (message.method === "renderer/initialize") {
    const { timeBuffer, options } = message.params;
    const timeView = timeBuffer
      ? new Float64Array(timeBuffer)
      : new Float64Array(1);
    if (_workerApplication) {
      _workerApplication.destroy();
    }
    _workerApplication = new WorkerApplication(timeView);
    await _workerApplication.init({ ...options, autoStart: false });
    await _workerApplication.loadScenes(_initialScenes);
    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });
    self.postMessage({ jsonrpc: "2.0", method: "renderer/initialized" });
  }

  if (message.method === "renderer/start") {
    _workerApplication.start();
    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });
  }

  if (message.method === "renderer/update") {
    const { time } = message.params;
    _workerApplication.update(time);
    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });
  }

  if (message.method === "renderer/resize") {
    const { width, height, resolution } = message.params;
    _workerApplication.resize(width, height, resolution);
    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });
  }
};

export default "";
