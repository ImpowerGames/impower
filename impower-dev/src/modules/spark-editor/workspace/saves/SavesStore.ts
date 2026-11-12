import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { SavesEvents } from "@impower/spark-web-player/src/saves/SavesViews";
import type { SavesViewState } from "@impower/spark-web-player/src/saves/savesView";
import {
  DidChangeSavesViewMessage,
  SavesViewActionMessage,
  savesActionEvents,
  type SavesViewAction,
} from "@impower/spark-web-player/src/saves/savesViewMessages";
import { signal } from "@preact/signals";

export class SavesStore {
  readonly view = signal<SavesViewState | null>(null);

  readonly events: SavesEvents = savesActionEvents((action) => this.act(action));

  receive(message: unknown) {
    if (DidChangeSavesViewMessage.type.isNotification(message)) {
      this.view.value = message.params.view;
    }
  }

  act(action: SavesViewAction) {
    sendProtocolMessage(SavesViewActionMessage.type.notification({ action }));
  }
}

const saves = new SavesStore();

export default saves;
