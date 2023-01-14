const { previewLine, SparkContext } = require("../../../spark-engine");
const { SparkDOMElement } = require("../../../spark-dom");

const vscode = acquireVsCodeApi();

let state = {
  parsed: undefined,
  docuri: "",
  dynamic: false,
  lastPreviewedLine: -1,
};

const previousState = vscode.getState();
if (previousState != undefined) {
  state = previousState;
  applyHtml();
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
    state.parsed = JSON.parse(event.data.content);
    const createElement = (type) => {
      return new SparkDOMElement(document.createElement(type));
    };
    sparkContext = new SparkContext(state.parsed, {
      config: {
        ui: { root, createElement },
      },
      ...(config || {}),
    });
    cacheFiles(state.parsed.objectMap);
    applyHtml();
    if (state.lastPreviewedLine >= 0) {
      previewLine(
        sparkContext,
        state.parsed,
        state.lastPreviewedLine,
        true,
        false
      );
    }
    vscode.setState(state);
  } else if (event.data.command === "sparkdown.setstate") {
    if (event.data.uri !== undefined) {
      state.docuri = event.data.uri;
    }
    if (event.data.dynamic !== undefined) {
      state.dynamic = event.data.dynamic;
    }
    vscode.setState(state);
  } else if (event.data.command === "sparkdown.showsourceline") {
    state.lastPreviewedLine = event.data.content;
    previewLine(sparkContext, state.parsed, event.data.content, true, false);
    vscode.setState(state);
  } else if (event.data.command === "sparkdown.highlightline") {
    state.lastPreviewedLine = event.data.content;
    previewLine(sparkContext, state.parsed, event.data.content, true, false);
    vscode.setState(state);
  }
});
