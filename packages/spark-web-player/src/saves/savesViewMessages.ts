import { MessageProtocolNotificationType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import type { SavesEvents } from "./SavesViews";
import type { SavesViewState } from "./savesView";

export type DidChangeSavesViewMethod = typeof DidChangeSavesViewMessage.method;

export interface DidChangeSavesViewParams {
  view: SavesViewState;
}

export class DidChangeSavesViewMessage {
  static readonly method = "preview/didChangeSavesView";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeSavesViewMethod,
    DidChangeSavesViewParams
  >(DidChangeSavesViewMessage.method);
}

export namespace DidChangeSavesViewMessage {
  export interface Notification extends NotificationMessage<
    DidChangeSavesViewMethod,
    DidChangeSavesViewParams
  > {}
}

export type SavesViewAction =
  | { kind: "open"; open: boolean }
  | { kind: "saveHere" }
  | { kind: "play"; id: string }
  | { kind: "rowMenu"; id: string | null }
  | { kind: "editValues"; id: string }
  | { kind: "renaming"; id: string | null }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string }
  | { kind: "back" }
  | { kind: "valueDraft"; key: string; text: string | null }
  | { kind: "valueSet"; key: string; value: string }
  | { kind: "valueSearch"; search: string };

export type SavesViewActionMethod = typeof SavesViewActionMessage.method;

export interface SavesViewActionParams {
  action: SavesViewAction;
}

export class SavesViewActionMessage {
  static readonly method = "preview/savesViewAction";
  static readonly type = new MessageProtocolNotificationType<
    SavesViewActionMethod,
    SavesViewActionParams
  >(SavesViewActionMessage.method);
}

export namespace SavesViewActionMessage {
  export interface Notification extends NotificationMessage<
    SavesViewActionMethod,
    SavesViewActionParams
  > {}
}

export const savesActionEvents = (
  send: (action: SavesViewAction) => void,
): SavesEvents => ({
  onOpen: (open) => send({ kind: "open", open }),
  onSaveHere: () => send({ kind: "saveHere" }),
  onPlay: (id) => send({ kind: "play", id }),
  onRowMenu: (id) => send({ kind: "rowMenu", id }),
  onEditValues: (id) => send({ kind: "editValues", id }),
  onRenaming: (id) => send({ kind: "renaming", id }),
  onRename: (id, name) => send({ kind: "rename", id, name }),
  onDelete: (id) => send({ kind: "delete", id }),
  onBack: () => send({ kind: "back" }),
  onValueDraft: (key, text) => send({ kind: "valueDraft", key, text }),
  onValueSet: (key, value) => send({ kind: "valueSet", key, value }),
  onValueSearch: (search) => send({ kind: "valueSearch", search }),
  onNoteRename: () => {},
});

export const runSavesAction = (
  events: SavesEvents,
  action: SavesViewAction,
): void => {
  switch (action.kind) {
    case "open":
      events.onOpen(action.open);
      return;
    case "saveHere":
      events.onSaveHere();
      return;
    case "play":
      events.onPlay(action.id);
      return;
    case "rowMenu":
      events.onRowMenu(action.id);
      return;
    case "editValues":
      events.onEditValues(action.id);
      return;
    case "renaming":
      events.onRenaming(action.id);
      return;
    case "rename":
      events.onRename(action.id, action.name);
      return;
    case "delete":
      events.onDelete(action.id);
      return;
    case "back":
      events.onBack();
      return;
    case "valueDraft":
      events.onValueDraft(action.key, action.text);
      return;
    case "valueSet":
      events.onValueSet(action.key, action.value);
      return;
    case "valueSearch":
      events.onValueSearch(action.search);
      return;
  }
};
