import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameContinuedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameContinuedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import SparkGamePreview from "@impower/spark-web-player/src/index.js";

console.log("running game-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

let loadingRequest: number | string | undefined = undefined;

const load = async () => {
  window.addEventListener(ConnectedPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ConnectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(ConfigureGameMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ConfigureGameMessage.type.isResponse(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(StartGameMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StartGameMessage.type.isResponse(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(StopGameMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (StopGameMessage.type.isResponse(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameExitedMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameExitedMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(
    GetGamePossibleBreakpointLocationsMessage.method,
    (e: Event) => {
      if (e instanceof CustomEvent) {
        const message = e.detail;
        if (
          GetGamePossibleBreakpointLocationsMessage.type.isResponse(message)
        ) {
          vscode.postMessage(message);
        }
      }
    }
  );
  window.addEventListener(GetGameStackTraceMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GetGameStackTraceMessage.type.isResponse(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GetGameThreadsMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GetGameThreadsMessage.type.isResponse(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameStartedThreadMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameStartedThreadMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameExitedThreadMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameExitedThreadMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameSteppedMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameSteppedMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameContinuedMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameContinuedMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameHitBreakpointMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameHitBreakpointMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameAwaitingInteractionMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameAwaitingInteractionMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(
    GameAutoAdvancedToContinueMessage.method,
    (e: Event) => {
      if (e instanceof CustomEvent) {
        const message = e.detail;
        if (GameAutoAdvancedToContinueMessage.type.isNotification(message)) {
          vscode.postMessage(message);
        }
      }
    }
  );
  window.addEventListener(GameClickedToContinueMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameClickedToContinueMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(GameChosePathToContinueMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (GameChosePathToContinueMessage.type.isNotification(message)) {
        vscode.postMessage(message);
      }
    }
  });
  window.addEventListener(LoadPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isRequest(message)) {
        if (message.id === loadingRequest) {
          if (message.params.type === "game") {
            document.body.classList.add("ready");
            vscode.postMessage(message);
          }
        }
      }
    }
  });
  window.addEventListener(ScrolledPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(SelectedPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SelectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(HoveredOnPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (HoveredOnPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(HoveredOffPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (HoveredOffPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  await Promise.allSettled([SparkGamePreview.init()]);
};

const emit = <T>(eventName: string, detail?: T): boolean => {
  return window.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail,
    })
  );
};

window.addEventListener("message", (e: MessageEvent) => {
  const message = e.data;
  if (LoadPreviewMessage.type.isRequest(message)) {
    if (message.params.type === "game") {
      loadingRequest = message.id;
      vscode.setState({
        textDocument: { uri: message.params.textDocument.uri },
      });
    }
  }
  // Forward MessageEvents from vscode extension to web components as CustomEvents
  emit(message.method, message);
});

load();
