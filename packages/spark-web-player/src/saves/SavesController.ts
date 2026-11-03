import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { DeleteSavesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/DeleteSavesMessage";
import {
  ListSavesMessage,
  type PreviewSave,
} from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { RenameSaveMessage } from "@impower/spark-editor-protocol/src/protocols/preview/RenameSaveMessage";
import { WriteSaveMessage } from "@impower/spark-editor-protocol/src/protocols/preview/WriteSaveMessage";
import type { GameSave } from "@impower/spark-engine/src/game/core/types/GameSave";
import {
  readLocalKey,
  withSavedValue,
} from "@impower/sparkdown/src/program/saveValueSet";
import type { StartingValueListing } from "@impower/sparkdown/src/program/startingValueLiterals";
import { EditSaveMessage } from "../main/workers/messages/EditSaveMessage";
import { SaveHereMessage } from "../main/workers/messages/SaveHereMessage";
import { SaveRefusalsMessage } from "../main/workers/messages/SaveRefusalsMessage";
import { CountFormsMessage } from "../main/workers/messages/CountFormsMessage";
import { CountKeysMessage } from "../main/workers/messages/CountKeysMessage";
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
  listing(start: string): Promise<StartingValueListing | undefined>;
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
  protected _valuesListing?: StartingValueListing;
  protected _search = "";
  protected _drafts: Record<string, string> = {};
  protected _unsaved: Record<string, string> = {};
  protected _note: (SaveNoteState & { id?: string }) | null = null;
  protected _noteTimer?: ReturnType<typeof setTimeout>;
  protected _lastRunScenes = new Map<string, string>();
  protected _run = newId();
  protected _valuesPlaces?: string;
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
              values: valuesRecord.values,
              ...(this._valuesListing ? { listing: this._valuesListing } : {}),
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
      values: save.values,
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
      values: save.values,
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
    this._valuesListing = undefined;
    this._valuesPlaces = undefined;
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

  protected async listValues(id: string): Promise<void> {
    const record = await this.current(id);
    const listing = record ? await this._host.listing(record.scene) : undefined;
    const counts = listing?.items.map((item) => item.key).filter(isPlaceKey) ?? [];
    let places: string | undefined;
    try {
      places =
        counts.length > 0
          ? (await this._host.askWorker(CountFormsMessage.type, { keys: counts }))?.places
          : undefined;
    } catch {
      places = undefined;
    }
    if (this._valuesId === id) {
      this._valuesListing = listing;
      this._valuesPlaces = places;
      this._host.changed();
    }
  }

  protected serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this._changes.then(work);
    this._changes = next.catch(() => undefined);
    return next;
  }

  current(id: string): Promise<PreviewSave | undefined> {
    return this.serial(() => this.placeCounts(id));
  }

  protected async placeCounts(id: string): Promise<PreviewSave | undefined> {
    const record = this.record(id);
    const places = record?.values.places;
    if (!record || !places) {
      return record;
    }
    let keys: Record<string, string> | undefined;
    try {
      keys = (await this._host.askWorker(CountKeysMessage.type, { places }))?.keys;
    } catch {
      return record;
    }
    if (!keys) {
      return record;
    }
    const saved = JSON.parse(places) as { forms?: Record<string, unknown> };
    const gone = Object.keys(saved.forms ?? {}).filter((key) => !Object.hasOwn(keys, key));
    const moves = Object.entries(keys).filter(([from, to]) => from !== to);
    if (moves.length === 0 && gone.length === 0) {
      return record;
    }
    const rekey = <T>(entries: Record<string, T>): Record<string, T> => {
      const out = { ...entries };
      for (const key of [...gone, ...moves.map(([from]) => from)]) {
        delete out[key];
      }
      for (const [from, to] of moves) {
        if (Object.hasOwn(entries, from)) {
          out[to] = entries[from]!;
        }
      }
      return out;
    };
    const placed = withUnapplied(
      {
        ...record,
        values: {
          ...record.values,
          values: rekey(record.values.values),
          places: JSON.stringify({ ...saved, forms: rekey(saved.forms ?? {}) }),
        },
      },
      (record.unapplied ?? []).flatMap((key) =>
        gone.includes(key) ? [] : [keys[key] ?? key],
      ),
    );
    try {
      await this.write(placed);
    } catch {
      return placed;
    }
    return placed;
  }

  protected async applied(
    data: string,
    values: Record<string, string>,
    keys: readonly string[],
  ): Promise<string> {
    const result = await this._host.askWorker(EditSaveMessage.type, {
      data,
      changes: Object.fromEntries(
        keys.flatMap((key) => (values[key] !== undefined ? [[key, values[key]]] : [])),
      ),
    });
    if (!result) {
      throw new Error("The player could not edit the save.");
    }
    return result.data;
  }

  protected async playable(id: string): Promise<PreviewSave | undefined> {
    const record = await this.placeCounts(id);
    if (!record || this._refusals[id] !== undefined || !record.unapplied?.length) {
      return record;
    }
    try {
      const edited = withUnapplied(
        {
          ...record,
          data: await this.applied(record.data, record.values.values, record.unapplied),
        },
        [],
      );
      await this.write(edited);
      return edited;
    } catch (e) {
      this.showNote({ name: record.name, failed: reasonOf(e), play: true });
      return undefined;
    }
  }

  setValue(key: string, value: string): Promise<void> {
    const id = this._valuesId;
    const places = this._valuesPlaces;
    return id
      ? this.serial(() => this.writeValue(id, key, value, places))
      : Promise.resolve();
  }

  protected async currentKey(key: string, places: string | undefined): Promise<string | undefined> {
    if (!isPlaceKey(key) || places === undefined) {
      return key;
    }
    try {
      return (await this._host.askWorker(CountKeysMessage.type, { places }))?.keys[key];
    } catch {
      return undefined;
    }
  }

  protected async writeValue(
    id: string,
    shown: string,
    value: string,
    shownPlaces: string | undefined,
  ): Promise<void> {
    const record = await this.placeCounts(id);
    if (!record) {
      return;
    }
    delete this._unsaved[shown];
    const key = await this.currentKey(shown, shownPlaces);
    if (key === undefined) {
      this._unsaved[shown] = record.values.values[shown] ?? "nil";
      this._host.changed();
      return;
    }
    const before = record.values.values[key];
    const values = withSavedValue(record.values.values, key, value);
    let unapplied = [...new Set([...(record.unapplied ?? []), key])];
    let data = record.data;
    let places = record.values.places;
    try {
      if (this._refusals[record.id] === undefined) {
        data = await this.applied(record.data, values, unapplied);
        unapplied = [];
      }
      if (isPlaceKey(key)) {
        const result = await this._host.askWorker(CountFormsMessage.type, {
          keys: Object.keys(values).filter(isPlaceKey),
        });
        if (!result) {
          throw new Error("The player could not place the save's counts.");
        }
        places = result.places;
      }
    } catch {
      this._unsaved[shown] = before ?? "nil";
      this._host.changed();
      return;
    }
    const local = readLocalKey(key);
    const edited = withUnapplied(
      {
        ...record,
        data,
        values: {
          values,
          frames: record.values.frames.map((frame, i) =>
            local && i === local.frame && Object.hasOwn(frame.params, local.name)
              ? { ...frame, params: { ...frame.params, [local.name]: value } }
              : frame,
          ),
          ...(places !== undefined ? { places } : {}),
        },
      },
      unapplied,
    );
    try {
      await this.write(edited);
    } catch {
      this._unsaved[shown] = before ?? "nil";
      this._host.changed();
    }
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

const isPlaceKey = (key: string) => key.startsWith("place:");

const withUnapplied = (record: PreviewSave, keys: string[]): PreviewSave => {
  const out: PreviewSave = { ...record };
  if (keys.length > 0) {
    out.unapplied = keys;
  } else {
    delete out.unapplied;
  }
  return out;
};

const reasonOf = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof e.message === "string"
    ? e.message
    : String(e);
