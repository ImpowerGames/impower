import { layoutState } from "@impower/impower-ui/layout";
import { PressedEditorChoiceMarkMessage } from "@impower/spark-editor-protocol/src/protocols/editor/PressedEditorChoiceMarkMessage";
import { SetEditorRouteMarksMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorRouteMarksMessage";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import {
  DidChangeRouteViewMessage,
  RouteViewActionMessage,
  type HostedRouteView,
  type RouteViewAction,
} from "@impower/spark-web-player/src/route/routeViewMessages";
import { computed, effect, signal } from "@preact/signals";
import problems from "../problems/ProblemsStore";
import { choiceMarkAction, routeMarks } from "./routeMarks";

export const routeScriptName = (uri: string) => {
  const name = decodeURI(uri).split("/").pop() ?? uri;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

export class RouteStore {
  readonly view = signal<HostedRouteView | null>(null);

  readonly sheetOpen = signal(false);

  readonly open = computed(
    () => problems.routeShown.value || this.sheetOpen.value,
  );

  protected _following?: () => void;

  protected _sentOpen = false;

  receive(message: unknown) {
    if (DidChangeRouteViewMessage.type.isNotification(message)) {
      this.follow();
      const view = message.params.view;
      this.view.value = view;
      if (view) {
        this._sentOpen = view.open;
        this.syncOpen();
      } else {
        this.close();
      }
      sendProtocolMessage(
        SetEditorRouteMarksMessage.type.request(routeMarks(view)),
      );
      return;
    }
    if (PressedEditorChoiceMarkMessage.type.isNotification(message)) {
      const { textDocument, line, action } = message.params;
      const next = choiceMarkAction(
        this.view.peek(),
        textDocument.uri,
        line,
        action,
      );
      if (next === "route") {
        this.show();
      } else if (next) {
        this.act(next);
      }
    }
  }

  toggle() {
    if (layoutState.current() === "phone") {
      this.sheetOpen.value = !this.sheetOpen.peek();
    } else {
      problems.toggleRoute();
    }
  }

  show() {
    if (layoutState.current() === "phone") {
      this.sheetOpen.value = true;
    } else if (!problems.routeShown.peek()) {
      problems.showPanel("route");
    }
  }

  close() {
    this.sheetOpen.value = false;
    if (problems.routeShown.peek()) {
      problems.collapsePanel();
    }
  }

  act(action: RouteViewAction) {
    sendProtocolMessage(RouteViewActionMessage.type.notification({ action }));
  }

  showLine(location: DocumentLocation) {
    this.sheetOpen.value = false;
    void problems.jump({
      uri: location.uri,
      line: location.range.start.line + 1,
      character: location.range.start.character,
    });
  }

  protected follow() {
    this._following ??= effect(() => {
      void this.open.value;
      this.syncOpen();
    });
  }

  protected syncOpen() {
    const open = this.open.peek();
    if (open === this._sentOpen || !this.view.peek()) {
      return;
    }
    this._sentOpen = open;
    this.act({ kind: open ? "open" : "close" });
  }
}

const route = new RouteStore();

export default route;
