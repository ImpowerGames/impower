const { previewLine, SparkGameRunner } = require("../../../spark-engine");

const vscode = acquireVsCodeApi();

const gameRunner = new SparkGameRunner();

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

const cacheFiles = async (variables) => {
  await Promise.all([
    ...Object.entries(variables || {})
      .filter(
        ([, variable]) =>
          variable &&
          variable.value &&
          (variable.type === "image" || variable.type === "audio")
      )
      .map(([, asset]) => {
        return new Promise((resolve) => {
          if (asset.type === "image") {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = asset.value;
            cachedFiles[asset.value] = img;
          }
          if (asset.type === "audio") {
            const audio = new Audio();
            audio.onload = resolve;
            audio.onerror = resolve;
            audio.src = asset.value;
            cachedFiles[asset.value] = audio;
          }
        });
      }),
  ]);
};

window.addEventListener("message", (event) => {
  if (event.data.command == "updateParsedJson") {
    state.parsed = JSON.parse(event.data.content);
    cacheFiles(state.parsed.variables);
    applyHtml();
    if (state.lastPreviewedLine >= 0) {
      previewLine(
        gameRunner,
        state.parsed,
        state.lastPreviewedLine,
        true,
        false
      );
    }
    vscode.setState(state);
  } else if (event.data.command == "setstate") {
    if (event.data.uri !== undefined) {
      state.docuri = event.data.uri;
    }
    if (event.data.dynamic !== undefined) {
      state.dynamic = event.data.dynamic;
    }
    vscode.setState(state);
  } else if (event.data.command == "showsourceline") {
    state.lastPreviewedLine = event.data.content;
    previewLine(gameRunner, state.parsed, event.data.content, true, false);
    vscode.setState(state);
  } else if (event.data.command == "highlightline") {
    state.lastPreviewedLine = event.data.content;
    previewLine(gameRunner, state.parsed, event.data.content, true, false);
    vscode.setState(state);
  }
});

const responsiveBreakpoints = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const resizeObserver = new ResizeObserver(([entry]) => {
  if (entry) {
    const width = entry.contentRect?.width;
    const keys = Object.keys(responsiveBreakpoints);
    let className = "";
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      className += `${k} `;
      if (responsiveBreakpoints[k] > width) {
        break;
      }
    }
    className = className.trim();
    if (entry.target.className !== className) {
      entry.target.className = className;
    }
  }
});

resizeObserver.observe(document.getElementById("ui-overlay"));
