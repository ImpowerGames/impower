import { Application, DOMAdapter, Graphics, WebWorkerAdapter } from "pixi.js";
import "pixi.js/unsafe-eval";

DOMAdapter.set(WebWorkerAdapter);

let timeView: Float64Array;
let app: Application;
let graphics: Graphics;

onmessage = async (e) => {
  const message = e.data;

  if (message.method === "renderer/initialize") {
    const { timeBuffer, options } = message.params;

    if (timeBuffer) {
      timeView = new Float64Array(timeBuffer);
    } else {
      timeView = new Float64Array(1);
    }

    app = new Application();
    await app.init({ ...options, autoStart: false });
    app.ticker.add(() => render());

    // TODO:
    // populateScene();

    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });

    self.postMessage({ jsonrpc: "2.0", method: "renderer/initialized" });
  }

  if (message.method === "renderer/start") {
    app.ticker.start();
    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });
  }

  if (message.method === "renderer/tick") {
    const { time } = message.params;
    timeView[0] = time;
    self.postMessage({
      jsonrpc: "2.0",
      id: message.id,
      method: message.method,
      result: {},
    });
  }
};

const populateScene = () => {
  graphics = new Graphics();

  // Rectangle
  graphics.rect(50, 50, 100, 100);
  graphics.fill(0xde3249);

  // Rectangle + line style 1
  graphics.rect(200, 50, 100, 100);
  graphics.fill(0x650a5a);
  graphics.stroke({ width: 2, color: 0xfeeb77 });

  // Rectangle + line style 2
  graphics.rect(350, 50, 100, 100);
  graphics.fill(0xc34288);
  graphics.stroke({ width: 10, color: 0xffbd01 });

  // Rectangle 2
  graphics.rect(530, 50, 140, 100);
  graphics.fill(0xaa4f08);
  graphics.stroke({ width: 2, color: 0xffffff });

  // Circle
  graphics.circle(100, 250, 50);
  graphics.fill(0xde3249);

  // Circle + line style 1
  graphics.circle(250, 250, 50);
  graphics.fill(0x650a5a);
  graphics.stroke({ width: 2, color: 0xfeeb77 });

  // Circle + line style 2
  graphics.circle(400, 250, 50);
  graphics.fill(0xc34288);
  graphics.stroke({ width: 10, color: 0xffbd01 });

  // Ellipse + line style 2
  graphics.ellipse(600, 250, 80, 50);
  graphics.fill(0xaa4f08);
  graphics.stroke({ width: 2, color: 0xffffff });

  // Draw a shape
  graphics.moveTo(50, 350);
  graphics.lineTo(250, 350);
  graphics.lineTo(100, 400);
  graphics.lineTo(50, 350);
  graphics.fill(0xff3300);
  graphics.stroke({ width: 4, color: 0xffd900 });

  // Draw a rounded rectangle
  graphics.roundRect(50, 440, 100, 100, 16);
  graphics.fill(0x650a5a);
  graphics.stroke({ width: 2, color: 0xff00ff });

  // Draw star
  graphics.star(360, 370, 5, 50);
  graphics.fill(0x35cc5a);
  graphics.stroke({ width: 2, color: 0xffffff });

  // Draw star 2
  graphics.star(280, 510, 7, 50);
  graphics.fill(0xffcc5a);
  graphics.stroke({ width: 2, color: 0xfffffd });

  // Draw star 3
  graphics.star(470, 450, 4, 50);
  graphics.fill(0x55335a);
  graphics.stroke({ width: 4, color: 0xffffff });

  // Draw polygon
  const path = [600, 370, 700, 460, 780, 420, 730, 570, 590, 520];

  graphics.poly(path);
  graphics.fill(0x3500fa);

  app.stage.addChild(graphics);
};

const updateScene = (elapsedTime: number) => {
  // Sync visual to a beat every 1 second
  const beatPeriod = 1.0;
  const beatProgress = (elapsedTime % beatPeriod) / beatPeriod;
  const scale = 1 + 0.5 * Math.sin(beatProgress * 2 * Math.PI);

  if (graphics) {
    graphics.scale.set(scale);
  }
};

const render = () => {
  if (!timeView) {
    return;
  }

  const elapsedTime = timeView[0] ?? 0;

  // TODO:
  // updateScene(elapsedTime);
};

export default "";
