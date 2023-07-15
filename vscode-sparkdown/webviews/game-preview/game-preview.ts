import { SparkDOMElement } from "@impower/spark-dom/src";
import { SparkContext, previewLine } from "@impower/spark-engine/src";

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const load = async () => {
  await Promise.allSettled([SparkdownScriptPreview.init()]);
};
load();

window.addEventListener("message", (e: MessageEvent) => {
  if (ConnectedPreviewNotification.is(e.data)) {
    if (e.data.params.type === "game") {
      vscode.postMessage(e.data);
    }
  }
  if (LoadedPreviewNotification.is(e.data)) {
    if (e.data.params.type === "game") {
      document.body.classList.add("ready");
      vscode.setState({ textDocument: e.data.params.textDocument });
      vscode.postMessage(e.data);
    }
  }
  if (ScrolledPreviewNotification.is(e.data)) {
    if (e.data.params.type === "game") {
      vscode.postMessage(e.data);
    }
  }
  if (SelectedPreviewNotification.is(e.data)) {
    if (e.data.params.type === "game") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOnPreviewNotification.is(e.data)) {
    if (e.data.params.type === "game") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOffPreviewNotification.is(e.data)) {
    if (e.data.params.type === "game") {
      vscode.postMessage(e.data);
    }
  }
});

let state = {
  textDocument: { uri: "" },
  program: undefined,
  lastPreviewedLine: -1,
};

const previousState = vscode.getState();
if (previousState != undefined) {
  state = previousState;
}

const cachedFiles = {};

const cacheFiles = async (objectMap) => {
  await Promise.all([
    ...Object.entries(objectMap?.["image"] || {}).map(([, asset]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        const src = asset?.src || "";
        img.src = src;
        cachedFiles[src] = img;
      });
    }),
    ...Object.entries(objectMap?.["audio"] || {}).map(([, asset]) => {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.onload = resolve;
        audio.onerror = resolve;
        const src = asset?.src || "";
        audio.src = src;
        cachedFiles[src] = audio;
      });
    }),
  ]);
};

let sparkContext;
let root = new SparkDOMElement(document.getElementById("ui-overlay"));

window.addEventListener("message", (event) => {
  if (event.data.command === "sparkdown.updateParsedJson") {
    state.program = JSON.parse(event.data.content);
    const createElement = (type) => {
      return new SparkDOMElement(document.createElement(type));
    };
    sparkContext = new SparkContext(state.program, {
      config: {
        ui: { root, createElement },
      },
      ...(config || {}),
    });
    cacheFiles(state.program.objectMap);
    if (state.lastPreviewedLine >= 0) {
      previewLine(
        sparkContext,
        state.program,
        state.lastPreviewedLine,
        true,
        false
      );
    }
    vscode.setState(state);
  } else if (event.data.command === "sparkdown.setstate") {
    if (event.data.uri !== undefined) {
      state.textDocument.uri = event.data.uri;
    }
    vscode.setState(state);
  } else if (event.data.command === "sparkdown.showsourceline") {
    state.lastPreviewedLine = event.data.content;
    previewLine(sparkContext, state.program, event.data.content, true, false);
    vscode.setState(state);
  } else if (event.data.command === "sparkdown.highlightline") {
    state.lastPreviewedLine = event.data.content;
    previewLine(sparkContext, state.program, event.data.content, true, false);
    vscode.setState(state);
  }
});
