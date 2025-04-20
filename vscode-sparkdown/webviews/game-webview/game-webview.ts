import { AddCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/AddCompilerFileMessage";
import { ConfigureCompilerMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/RemoveCompilerFileMessage";
import { UpdateCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/UpdateCompilerFileMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import { SparkdownFileRegistry } from "@impower/sparkdown/src/classes/SparkdownFileRegistry";

console.log("running game-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

// The language server omits image data when sending down the compiled program
// (This is so vscode doesn't hang while trying to deserialize and serialize the program)
// Instead we use a SparkdownFileRegistry to track and populate the image data inside this worker.
const fileRegistry = new SparkdownFileRegistry();

const load = async () => {
  // Forward responses and notifications from window to vscode extension
  window.addEventListener(MessageProtocol.event, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (e.target !== window) {
        vscode.postMessage(message);
        if (LoadPreviewMessage.type.isResponse(message)) {
          document.body.classList.add("ready");
        }
      }
    }
  });
  await Promise.allSettled([SparkWebPlayer.init()]);
};

window.addEventListener("message", (e: MessageEvent) => {
  const message = e.data;
  if (ConfigureCompilerMessage.type.isRequest(message)) {
    const { files } = message.params;
    if (files) {
      for (const file of files) {
        fileRegistry.add({ file });
      }
    }
    vscode.postMessage(
      ConfigureCompilerMessage.type.response(message.id, "sparkdown")
    );
  }
  if (AddCompilerFileMessage.type.isRequest(message)) {
    const { file } = message.params;
    fileRegistry.add({ file });
    vscode.postMessage(AddCompilerFileMessage.type.response(message.id, true));
  }
  if (UpdateCompilerFileMessage.type.isRequest(message)) {
    const { file } = message.params;
    fileRegistry.update({ file });
    vscode.postMessage(
      UpdateCompilerFileMessage.type.response(message.id, true)
    );
  }
  if (RemoveCompilerFileMessage.type.isRequest(message)) {
    const { file } = message.params;
    fileRegistry.remove({ file });
    vscode.postMessage(
      RemoveCompilerFileMessage.type.response(message.id, true)
    );
  }
  if (LoadGameMessage.type.isRequest(message)) {
    const { program } = message.params;
    // On LoadGame, we augment the program with data from the fileRegistry
    // (since the language server stripped out this data earlier)
    for (const [, image] of Object.entries(program.context?.["image"] || {})) {
      if (image.ext === "svg" && !image.data) {
        image.data = fileRegistry.get(image.uri)?.data;
      }
    }
  }
  if (LoadPreviewMessage.type.isRequest(message)) {
    vscode.setState({
      textDocument: { uri: message.params.textDocument.uri },
    });
  }
  // Forward protocol messages from vscode extension to window
  window.dispatchEvent(
    new CustomEvent(MessageProtocol.event, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: message,
    })
  );
});

load();
