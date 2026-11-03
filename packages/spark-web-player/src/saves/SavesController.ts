import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { DeleteSavesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/DeleteSavesMessage";
import {
  ListSavesMessage,
  type PreviewSave,
} from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { RenameSaveMessage } from "@impower/spark-editor-protocol/src/protocols/preview/RenameSaveMessage";
import { WriteSaveMessage } from "@impower/spark-editor-protocol/src/protocols/preview/WriteSaveMessage";
import type {
  GameSave,
  SaveListed,
  SaveSource,
} from "@impower/spark-engine/src/game/core/types/GameSave";
import type { StartingValueSet } from "@impower/sparkdown/src/program/startingValueLiterals";
import { EditSaveMessage } from "../main/workers/messages/EditSaveMessage";
import { PlayableSaveMessage } from "../main/workers/messages/PlayableSaveMessage";
import { SaveHereMessage } from "../main/workers/messages/SaveHereMessage";
import { SaveListingMessage } from "../main/workers/messages/SaveListingMessage";
import { SaveRefusalsMessage } from "../main/workers/messages/SaveRefusalsMessage";
import { SaveStartingValuesMessage } from "../main/workers/messages/SaveStartingValuesMessage";
import type { SavesEvents } from "./SavesViews";
import {
  enteringName,
  savedName,
  type SaveNoteState,
  type SaveRow,
  type SavesViewState,
} from "./savesView";

export interface SavesHost {
  requestHost<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<R>;
  askWorker<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<R | undefined>;
  playing(): boolean;
  canPlace(): boolean;
  run(): number | undefined;
  playFromSave(data: string): Promise<void>;
  changed(): void;
}

export const SAVE_NOTE_MS = 4000;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class SavesController {
  protected _saves: PreviewSave[] = [];
  protected _refusals: Record<string, string> = {};
  protected _open = false;
  protected _rowMenu?: string;
  protected _renaming?: string;
  protected _valuesId?: string;
  protected _listed?: SaveListed;
  protected _search = "";
  protected _drafts: Record<string, string> = {};
  protected _unsaved: Record<string, string> = {};
  protected _note: (SaveNoteState & { id?: string }) | null = null;
  protected _noteTimer?: ReturnType<typeof setTimeout>;
  protected _lastRunScenes = new Map<string, string>();
  protected _run = newId();
  protected _changes: Promise<unknown> = Promise.resolve();
  protected _checks = 0;

  constructor(protected _host: SavesHost) {}

  get saves(): readonly PreviewSave[] {
    return this._saves;
  }

  get open(): boolean {
    return this._open;
  }

  record(id: string): PreviewSave | undefined {
    return this._saves.find((save) => save.id === id);
  }

  rows(): SaveRow[] {
    return this._saves.map((save) => ({
      id: save.id,
      kind: save.kind,
      name: save.name,
      scene: save.scene,
      line: save.line,
      time: save.time,
      gone: this._refusals[save.id] !== undefined,
    }));
  }

  viewState(): SavesViewState {
    const valuesRecord = this._valuesId ? this.record(this._valuesId) : undefined;
    const valuesRow = valuesRecord
      ? this.rows().find((row) => row.id === valuesRecord.id)
      : undefined;
    return {
      open: this._open,
      playing: this._host.playing(),
      saves: this.rows(),
      ...(this._rowMenu ? { rowMenu: this._rowMenu } : {}),
      ...(this._renaming ? { renaming: this._renaming } : {}),
      ...(valuesRecord && valuesRow
        ? {
            values: {
              save: valuesRow,
              values: this._listed?.values ?? { values: {}, frames: [] },
              ...(this._listed ? { listing: this._listed.listing } : {}),
              search: this._search,
              drafts: this._drafts,
              unsaved: this._unsaved,
            },
          }
        : {}),
    };
  }

  note(): SaveNoteState | null {
    return this._note;
  }

  async load(): Promise<void> {
    try {
      const result = await this._host.requestHost(ListSavesMessage.type, {});
      this._saves = Array.isArray(result?.saves) ? result.saves : [];
    } catch {
      this._saves = [];
    }
    const earlier = earlierRuns(this._saves);
    if (earlier.length > 0) {
      this._saves = this._saves.filter((save) => !earlier.includes(save.id));
      void this.serial(() => this.deleteQuietly(earlier));
    }
    this._host.changed();
    await this.checkPlaceable();
  }

  protected async deleteQuietly(ids: string[]): Promise<void> {
    try {
      await this._host.requestHost(DeleteSavesMessage.type, { ids });
    } catch {
      return;
    }
  }

  async checkPlaceable(): Promise<void> {
    const check = ++this._checks;
    const saves = this._saves.map(({ id, data }) => ({ id, data }));
    if (saves.length === 0) {
      this._refusals = {};
      this._host.changed();
      return;
    }
    if (!this._host.canPlace()) {
      return;
    }
    try {
      const result = await this._host.askWorker(SaveRefusalsMessage.type, {
        saves,
      });
      if (check === this._checks && result) {
        this._refusals = result.refusals;
        this._host.changed();
      }
    } catch {
      return;
    }
  }

  playStarted(): Promise<void> {
    return this.serial(() => this.clearLastRun());
  }

  protected async clearLastRun(): Promise<void> {
    this._lastRunScenes.clear();
    this._run = newId();
    const lastRun = this._saves.filter((save) => save.kind === "lastRun");
    if (lastRun.length === 0) {
      return;
    }
    const ids = lastRun.map((save) => save.id);
    this._saves = this._saves.filter((save) => save.kind !== "lastRun");
    if (this._valuesId && ids.includes(this._valuesId)) {
      this.closeValues();
    }
    this._host.changed();
    await this.deleteQuietly(ids);
  }

  sceneEntered(save: GameSave): Promise<void> {
    return this.serial(() => this.writeSceneEntry(save));
  }

  protected async writeSceneEntry(save: GameSave): Promise<void> {
    const id = this._lastRunScenes.get(save.scene) ?? newId();
    this._lastRunScenes.set(save.scene, id);
    await this.write({
      id,
      kind: "lastRun",
      name: enteringName(save.scene),
      scene: save.scene,
      uri: save.uri,
      line: save.line,
      time: Date.now(),
      data: save.data,
      ...(save.entry ? { entry: save.entry } : {}),
      run: this._run,
    });
  }

  protected async write(record: PreviewSave): Promise<boolean> {
    const at = this._saves.findIndex((save) => save.id === record.id);
    const before = at >= 0 ? this._saves[at] : undefined;
    this._saves =
      at >= 0
        ? this._saves.map((save, i) => (i === at ? record : save))
        : [...this._saves, record];
    if (before?.data !== record.data) {
      delete this._refusals[record.id];
    }
    this._host.changed();
    try {
      await this._host.requestHost(WriteSaveMessage.type, { save: record });
      return true;
    } catch (e) {
      this._saves = before
        ? this._saves.map((save) => (save.id === record.id ? before : save))
        : this._saves.filter((save) => save.id !== record.id);
      this._host.changed();
      throw e;
    }
  }

  protected showNote(note: SaveNoteState & { id?: string }) {
    if (this._noteTimer) {
      clearTimeout(this._noteTimer);
    }
    this._note = note;
    this._noteTimer = setTimeout(() => {
      this._noteTimer = undefined;
      this._note = null;
      this._host.changed();
    }, SAVE_NOTE_MS);
    this._host.changed();
  }

  async saveHere(): Promise<void> {
    const run = this._host.run();
    if (!this._host.playing() || run === undefined) {
      return;
    }
    let save: GameSave | null | undefined;
    try {
      save = (await this._host.askWorker(SaveHereMessage.type, { run }))?.save;
    } catch (e) {
      this.showNote({ name: "", failed: reasonOf(e) });
      return;
    }
    if (!save) {
      this.showNote({ name: "", failed: "The game is not at a line it can save." });
      return;
    }
    const name = savedName(save.scene, save.line);
    const record: PreviewSave = {
      id: newId(),
      kind: "saved",
      name,
      scene: save.scene,
      uri: save.uri,
      line: save.line,
      time: Date.now(),
      data: save.data,
    };
    try {
      await this.serial(() => this.write(record));
      this.showNote({ name, id: record.id });
    } catch (e) {
      this.showNote({ name, failed: reasonOf(e) });
    }
  }

  protected closeValues() {
    this._valuesId = undefined;
    this._listed = undefined;
    this._search = "";
    this._drafts = {};
    this._unsaved = {};
  }

  rename(id: string, name: string): Promise<void> {
    return this.serial(() => this.renameNow(id, name));
  }

  protected async renameNow(id: string, name: string): Promise<void> {
    const record = this.record(id);
    this._renaming = undefined;
    if (!record) {
      this._host.changed();
      return;
    }
    this._saves = this._saves.map((save) => (save.id === id ? { ...save, name } : save));
    this._host.changed();
    try {
      await this._host.requestHost(RenameSaveMessage.type, { id, name });
    } catch {
      this._saves = this._saves.map((save) =>
        save.id === id ? { ...save, name: record.name } : save,
      );
      this._host.changed();
    }
  }

  delete(id: string): Promise<void> {
    return this.serial(() => this.deleteNow(id));
  }

  protected async deleteNow(id: string): Promise<void> {
    const record = this.record(id);
    if (!record) {
      return;
    }
    this._rowMenu = undefined;
    if (this._valuesId === id) {
      this.closeValues();
    }
    this._saves = this._saves.filter((save) => save.id !== id);
    this._host.changed();
    try {
      await this._host.requestHost(DeleteSavesMessage.type, { ids: [id] });
    } catch {
      this._saves = [...this._saves, record];
      this._host.changed();
    }
  }

  async editValues(id: string): Promise<void> {
    const record = this.record(id);
    this._rowMenu = undefined;
    if (!record) {
      return;
    }
    this.closeValues();
    this._valuesId = id;
    this._host.changed();
    await this.listValues(id);
  }

  async programChanged(): Promise<void> {
    await this.checkPlaceable();
    const id = this._valuesId;
    if (id) {
      await this.listValues(id);
    }
  }

  protected listValues(id: string): Promise<void> {
    return this.serial(() => this.listValuesNow(id));
  }

  protected async listValuesNow(id: string): Promise<void> {
    const record = this.record(id);
    let listed: SaveListed | undefined;
    try {
      listed = record
        ? (
            await this._host.askWorker(SaveListingMessage.type, {
              save: sourceOf(record),
              start: record.scene,
            })
          )?.listed
        : undefined;
    } catch {
      listed = undefined;
    }
    if (this._valuesId === id) {
      this._listed = listed;
      this._host.changed();
    }
  }

  protected serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this._changes.then(work);
    this._changes = next.catch(() => undefined);
    return next;
  }

  startingValuesOf(id: string, start: string): Promise<StartingValueSet | undefined> {
    return this.serial(async () => {
      const record = this.record(id);
      if (!record) {
        return undefined;
      }
      try {
        return (
          await this._host.askWorker(SaveStartingValuesMessage.type, {
            save: sourceOf(record),
            start,
          })
        )?.values;
      } catch {
        return undefined;
      }
    });
  }

  protected async playable(id: string): Promise<PreviewSave | undefined> {
    const record = this.record(id);
    if (!record || this._refusals[id] !== undefined || !record.edits?.length) {
      return record;
    }
    try {
      const save = (
        await this._host.askWorker(PlayableSaveMessage.type, { save: sourceOf(record) })
      )?.save;
      if (!save) {
        throw new Error("The player could not write the save's edits.");
      }
      const edited = withSource(record, save);
      await this.write(edited);
      return edited;
    } catch (e) {
      this.showNote({ name: record.name, failed: reasonOf(e), play: true });
      return undefined;
    }
  }

  setValue(key: string, value: string): Promise<void> {
    const id = this._valuesId;
    const listed = this._listed;
    return id
      ? this.serial(() => this.writeValue(id, key, value, listed))
      : Promise.resolve();
  }

  protected async writeValue(
    id: string,
    shown: string,
    value: string,
    listed: SaveListed | undefined,
  ): Promise<void> {
    const record = this.record(id);
    if (!record) {
      return;
    }
    delete this._unsaved[shown];
    const before = listed?.values.values[shown];
    try {
      const save = (
        await this._host.askWorker(EditSaveMessage.type, {
          save: sourceOf(record),
          key: listed?.forms[shown] ?? shown,
          value,
        })
      )?.save;
      if (!save) {
        throw new Error("The player could not edit the save.");
      }
      await this.write(withSource(record, save));
    } catch {
      this._unsaved[shown] = before ?? "nil";
      this._host.changed();
      return;
    }
    await this.listValuesNow(id);
  }

  readonly events: SavesEvents = {
    onOpen: (open) => {
      this._open = open;
      this._rowMenu = undefined;
      this._renaming = undefined;
      if (!open) {
        this.closeValues();
      }
      this._host.changed();
    },
    onSaveHere: () => void this.saveHere(),
    onPlay: (id) => {
      if (!this.record(id) || this._refusals[id] !== undefined) {
        return;
      }
      this._open = false;
      this._rowMenu = undefined;
      this.closeValues();
      this._host.changed();
      void this.serial(() => this.playable(id)).then((record) =>
        record && this._refusals[id] === undefined
          ? this._host.playFromSave(record.data)
          : undefined,
      );
    },
    onRowMenu: (id) => {
      this._rowMenu = id ?? undefined;
      this._host.changed();
    },
    onEditValues: (id) => void this.editValues(id),
    onRenaming: (id) => {
      this._renaming = id ?? undefined;
      this._rowMenu = undefined;
      this._host.changed();
    },
    onRename: (id, name) => void this.rename(id, name),
    onDelete: (id) => void this.delete(id),
    onBack: () => {
      this.closeValues();
      this._host.changed();
    },
    onValueDraft: (key, text) => {
      if (text === null) {
        delete this._drafts[key];
      } else {
        this._drafts[key] = text;
      }
      this._drafts = { ...this._drafts };
      this._host.changed();
    },
    onValueSet: (key, value) => void this.setValue(key, value),
    onValueSearch: (search) => {
      this._search = search;
      this._host.changed();
    },
    onNoteRename: () => {
      const id = this._note?.id;
      if (!id) {
        return;
      }
      this._open = true;
      this._renaming = id;
      this._rowMenu = undefined;
      this.closeValues();
      this._note = null;
      if (this._noteTimer) {
        clearTimeout(this._noteTimer);
        this._noteTimer = undefined;
      }
      this._host.changed();
    },
  };

  dispose() {
    if (this._noteTimer) {
      clearTimeout(this._noteTimer);
      this._noteTimer = undefined;
    }
  }
}

const earlierRuns = (saves: readonly PreviewSave[]): string[] => {
  const lastRun = saves.filter((save) => save.kind === "lastRun");
  if (lastRun.length === 0) {
    return [];
  }
  const newest = lastRun.reduce((a, b) => (b.time > a.time ? b : a));
  return lastRun
    .filter((save) => save !== newest && (save.run === undefined || save.run !== newest.run))
    .map((save) => save.id);
};

const sourceOf = (record: PreviewSave): SaveSource => ({
  data: record.data,
  ...(record.entry ? { entry: record.entry } : {}),
  ...(record.edits?.length ? { edits: record.edits } : {}),
});

const withSource = (record: PreviewSave, save: SaveSource): PreviewSave => {
  const out: PreviewSave = { ...record, data: save.data };
  delete out.entry;
  delete out.edits;
  return {
    ...out,
    ...(save.entry ? { entry: save.entry } : {}),
    ...(save.edits?.length ? { edits: save.edits } : {}),
  };
};

const reasonOf = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof e.message === "string"
    ? e.message
    : String(e);
