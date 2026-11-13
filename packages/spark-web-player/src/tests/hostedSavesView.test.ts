import { afterEach, describe, expect, test } from "vitest";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GamePlayerController } from "../GamePlayerController";
import {
  DidChangeSavesViewMessage,
  SavesViewActionMessage,
  savesActionEvents,
  type SavesViewAction,
} from "../saves/savesViewMessages";
import { savesEscape, type SaveRow, type SavesViewState } from "../saves/savesView";

const controllers: GamePlayerController[] = [];

const row = (id: string, kind: SaveRow["kind"]): SaveRow => ({
  id,
  kind,
  name: kind === "lastRun" ? "Entering interrogation" : "Before the confession",
  scene: "interrogation",
  line: 10,
  time: 0,
  gone: false,
});

function hostedPlayer() {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const savesButton = document.createElement("div");
  const savesMenu = document.createElement("div");
  const saveNote = document.createElement("div");
  viewport.append(savesButton, savesMenu, saveNote);
  host.append(viewport);
  document.body.append(host);
  const views: SavesViewState[] = [];
  host.addEventListener(MessageProtocol.event, (e) => {
    const message = (e as CustomEvent).detail;
    if (DidChangeSavesViewMessage.type.isNotification(message)) {
      views.push(message.params.view);
    }
  });
  const controller = new GamePlayerController(
    host,
    { viewport, savesButton, savesMenu, saveNote } as any,
    { hosted: true },
  );
  (controller as any).registerProtocolHandlers();
  controllers.push(controller);
  const act = (action: SavesViewAction) =>
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        detail: SavesViewActionMessage.type.notification({ action }),
      }),
    );
  return { controller, savesButton, savesMenu, saveNote, views, act };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.dispose();
  }
  document.body.replaceChildren();
});

describe("a Saves menu the host shows", () => {
  test("is sent to the host and drawn nowhere in the player", () => {
    const p = hostedPlayer();
    (p.controller as any).renderSaves();
    expect(p.views.at(-1)).toEqual({ open: false, playing: false, saves: [] });
    expect(p.savesButton.childElementCount).toBe(0);
    expect(p.savesMenu.childElementCount).toBe(0);
  });

  test("opens as the host asks and sends the open menu back", () => {
    const p = hostedPlayer();
    p.act({ kind: "open", open: true });
    expect(p.views.at(-1)?.open).toBe(true);
    expect(p.savesMenu.childElementCount).toBe(0);
    p.act({ kind: "open", open: false });
    expect(p.views.at(-1)?.open).toBe(false);
  });

  test("hands every host action to the player's own saves events", () => {
    const p = hostedPlayer();
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        calls.push([name, ...args]);
    (p.controller as any)._saves.events = {
      onOpen: record("open"),
      onSaveHere: record("saveHere"),
      onPlay: record("play"),
      onRowMenu: record("rowMenu"),
      onEditValues: record("editValues"),
      onRenaming: record("renaming"),
      onRename: record("rename"),
      onDelete: record("delete"),
      onBack: record("back"),
      onValueDraft: record("valueDraft"),
      onValueSet: record("valueSet"),
      onValueSearch: record("valueSearch"),
      onNoteRename: record("noteRename"),
    };
    const actions: SavesViewAction[] = [
      { kind: "open", open: true },
      { kind: "saveHere" },
      { kind: "play", id: "s1" },
      { kind: "rowMenu", id: "s1" },
      { kind: "rowMenu", id: null },
      { kind: "editValues", id: "s1" },
      { kind: "renaming", id: "s1" },
      { kind: "rename", id: "s1", name: "Before" },
      { kind: "delete", id: "s1" },
      { kind: "back" },
      { kind: "valueDraft", key: "trust", text: "3" },
      { kind: "valueDraft", key: "trust", text: null },
      { kind: "valueSet", key: "trust", value: "3" },
      { kind: "valueSearch", search: "tr" },
    ];
    for (const action of actions) {
      p.act(action);
    }
    expect(calls).toEqual([
      ["open", true],
      ["saveHere"],
      ["play", "s1"],
      ["rowMenu", "s1"],
      ["rowMenu", null],
      ["editValues", "s1"],
      ["renaming", "s1"],
      ["rename", "s1", "Before"],
      ["delete", "s1"],
      ["back"],
      ["valueDraft", "trust", "3"],
      ["valueDraft", "trust", null],
      ["valueSet", "trust", "3"],
      ["valueSearch", "tr"],
    ]);
  });

  test("keeps the note over the game in the player", () => {
    const p = hostedPlayer();
    (p.controller as any)._saves.note = () => ({ name: "interrogation, line 11" });
    (p.controller as any).renderSaves();
    expect(p.saveNote.textContent).toContain('Saved as "interrogation, line 11"');
    expect(p.saveNote.textContent).toContain("Rename");
  });
});

describe("the host's saves events", () => {
  test("send each event as the action the player runs", () => {
    const sent: SavesViewAction[] = [];
    const events = savesActionEvents((action) => sent.push(action));
    events.onOpen(true);
    events.onSaveHere();
    events.onPlay("s1");
    events.onRowMenu(null);
    events.onEditValues("s1");
    events.onRenaming(null);
    events.onRename("s1", "Before");
    events.onDelete("s1");
    events.onBack();
    events.onValueDraft("trust", null);
    events.onValueSet("trust", "3");
    events.onValueSearch("tr");
    expect(sent).toEqual([
      { kind: "open", open: true },
      { kind: "saveHere" },
      { kind: "play", id: "s1" },
      { kind: "rowMenu", id: null },
      { kind: "editValues", id: "s1" },
      { kind: "renaming", id: null },
      { kind: "rename", id: "s1", name: "Before" },
      { kind: "delete", id: "s1" },
      { kind: "back" },
      { kind: "valueDraft", key: "trust", text: null },
      { kind: "valueSet", key: "trust", value: "3" },
      { kind: "valueSearch", search: "tr" },
    ]);
  });
});

describe("Escape in the Saves menu", () => {
  const open: SavesViewState = {
    open: true,
    playing: false,
    saves: [row("l1", "lastRun"), row("s1", "saved")],
  };
  const values: SavesViewState = {
    ...open,
    values: {
      save: row("s1", "saved"),
      values: { values: {}, frames: [] },
      search: "",
      drafts: { trust: "4" },
      unsaved: {},
    },
  };

  test("closes the list, goes back from a save's values and leaves a rename or a draft to its field", () => {
    expect(savesEscape(open, null)).toBe("close");
    expect(savesEscape({ ...open, open: false }, null)).toBeNull();
    expect(savesEscape({ ...open, renaming: "s1" }, null)).toBeNull();
    expect(savesEscape(values, null)).toBe("back");
    expect(savesEscape(values, "suspect")).toBe("back");
    expect(savesEscape(values, "trust")).toBeNull();
  });
});
