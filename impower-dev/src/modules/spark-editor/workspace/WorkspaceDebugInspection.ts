import type { DebugFrameEntry } from "@impower/spark-web-player/src/components/DebugCallStack/DebugCallStack";
import type { DebugVariableNode } from "@impower/spark-web-player/src/components/DebugVariables/DebugVariables";
import {
  DEBUG_WATCH_TEXT,
  type DebugWatchEntry,
} from "@impower/spark-web-player/src/components/DebugWatch/DebugWatch";
import type { DebugProtocol } from "@vscode/debugprotocol";
import workspace, {
  IDLE_DEBUG_INSPECTION,
  type DebugInspectionState,
  type InspectedFrame,
  type WatchResult,
} from "./WorkspaceStore";

export type DebugRequest = (
  command: string,
  args: unknown,
) => Promise<DebugProtocol.Response | null>;

export interface DebugSource {
  path: string;
  inProject: boolean;
}

export interface WorkspaceDebugInspectionOptions {
  request: DebugRequest;
  saveWatch?: (expressions: readonly string[]) => void;
  source?: (uri: string) => DebugSource;
}

export const DEBUG_INSPECTION_TEXT = {
  refused: "The debugger refused this request.",
  noValue: "This expression has no value here.",
} as const;

interface Place {
  readonly id: string;
  readonly name: string;
  readonly children: Map<string, Place>;
  open?: boolean;
  openByDefault: boolean;
}

interface Row {
  readonly place: Place;
  readonly parent: Row | null;
  readonly ref: number;
  readonly variable?: DebugProtocol.Variable;
  readonly scope?: DebugProtocol.Scope;
  children: Row[] | null;
  message?: string;
  mark?: string;
}

class Snapshot {
  retired = false;

  loading = true;

  scopes: Row[] = [];

  readonly rows = new Map<Place, Row>();

  readonly watch = new Map<string, WatchResult>();

  editing: Place | null = null;

  marking: Promise<void> = Promise.resolve();

  previous: Snapshot | null = null;

  constructor(
    readonly frameId: number | null,
    protected readonly _request: DebugRequest,
    protected readonly _changed: () => void,
  ) {}

  changed() {
    if (!this.retired) {
      this._changed();
    }
  }

  async ask<T extends DebugProtocol.Response>(
    command: string,
    args: unknown,
  ): Promise<T | null> {
    if (this.retired) {
      return null;
    }
    const response = await this._request(command, args);
    return this.retired ? null : (response as T | null);
  }

  add(place: Place, parent: Row | null, ref: number, item: Partial<Row>): Row {
    const row: Row = { place, parent, ref, children: null, ...item };
    this.rows.set(place, row);
    return row;
  }
}

const scopeRank = (scope: DebugProtocol.Scope) =>
  scope.expensive ? 2 : scope.presentationHint === "locals" ? 1 : 0;

const defaultSource = (uri: string): DebugSource => ({
  path: uri.slice(uri.lastIndexOf("/") + 1),
  inProject: Boolean(uri),
});

const refusal = (response: DebugProtocol.Response | null) =>
  response?.message || DEBUG_INSPECTION_TEXT.refused;

const isOpen = (place: Place) => place.open ?? place.openByDefault;

export function watchEntries(
  state: DebugInspectionState,
  expressions: readonly string[],
): DebugWatchEntry[] {
  return expressions.map((expression, index) => {
    const result = state.watch.get(expression);
    return {
      key: String(index),
      expression,
      ...(result && "error" in result
        ? { error: result.error }
        : { value: result?.value }),
    };
  });
}

export function frameEntries(state: DebugInspectionState): DebugFrameEntry[] {
  return state.frames.map((frame) => ({
    id: frame.id,
    name: frame.name,
    location: `${frame.path}:${frame.line + 1}`,
    inProject: frame.inProject,
    selected: frame.id === state.frameId,
  }));
}

export default class WorkspaceDebugInspection {
  protected _status: DebugInspectionState["status"] = "none";

  protected _frames: readonly InspectedFrame[] = [];

  protected _snapshot: Snapshot | null = null;

  protected _accepted = new Map<string, Place>();

  protected _watchEditing: number | null = null;

  protected _places = new Map<string, Place>();

  protected readonly _root: Place = this.place(null, "", false);

  protected _breaks: Promise<void> = Promise.resolve();

  constructor(protected readonly _options: WorkspaceDebugInspectionOptions) {}

  get state(): DebugInspectionState {
    return workspace.debugInspection.peek();
  }

  get expressions(): readonly string[] {
    return workspace.watchExpressions.peek();
  }

  begin() {
    this._status = "running";
    this.close();
  }

  end() {
    this._status = "none";
    this.close();
  }

  resume() {
    if (this._status === "none") {
      return;
    }
    this._status = "running";
    this.replace(null);
    this._frames = [];
    this.publish();
  }

  stopped(stack: DebugProtocol.StackTraceResponse["body"]) {
    const source = this._options.source ?? defaultSource;
    this._status = "paused";
    this._frames = stack.stackFrames.map((frame) => {
      const uri = frame.source?.path ?? "";
      const place = uri ? source(uri) : { path: "", inProject: false };
      return {
        id: frame.id,
        name: frame.name,
        uri,
        line: frame.line,
        character: frame.column,
        path: place.path,
        inProject: place.inProject,
      };
    });
    return this.open(this._frames[0]?.id ?? null);
  }

  async selectFrame(frameId: number) {
    if (
      this._status !== "paused" ||
      !this._frames.some((frame) => frame.id === frameId)
    ) {
      return;
    }
    await this.open(frameId);
  }

  async toggle(key: string) {
    const place = this._places.get(key);
    if (!place) {
      return;
    }
    const opening = !isOpen(place);
    place.open = opening;
    this.publish();
    const snapshot = this._snapshot;
    const row = snapshot?.rows.get(place);
    if (!opening || !snapshot || snapshot.loading || !row || row.children) {
      return;
    }
    await this.loadOpen(snapshot, [row]);
    snapshot.changed();
    await this.mark(snapshot);
  }

  edit(key: string | null) {
    const snapshot = this._snapshot;
    if (!snapshot) {
      return;
    }
    const place = key == null ? null : (this._places.get(key) ?? null);
    const row = place ? snapshot.rows.get(place) : undefined;
    if (row) {
      row.message = undefined;
    }
    snapshot.editing = place;
    this.publish();
  }

  async setValue(key: string, value: string) {
    const snapshot = this._snapshot;
    if (!snapshot) {
      return;
    }
    snapshot.editing = null;
    this.publish();
    const row = this.row(snapshot, key);
    if (!row?.parent) {
      return;
    }
    const response = await snapshot.ask("setVariable", {
      variablesReference: row.parent.ref,
      name: row.place.name,
      value,
    });
    if (!response) {
      return;
    }
    if (!response.success) {
      this.note(snapshot, row, refusal(response));
      return;
    }
    if (this._snapshot === snapshot) {
      await this.open(snapshot.frameId);
    }
  }

  breakOnChange(key: string, on: boolean) {
    const snapshot = this._snapshot;
    const run = this._breaks.then(() => this.applyBreak(snapshot, key, on));
    this._breaks = run.catch(() => {});
    return run;
  }

  async addWatch(expression: string) {
    this.saveWatch([...this.expressions, expression]);
    await this.evaluateWatch(this._snapshot, [expression]);
  }

  async changeWatch(index: number, expression: string) {
    const expressions = [...this.expressions];
    if (index < 0 || index >= expressions.length) {
      return;
    }
    expressions[index] = expression;
    this._watchEditing = null;
    this.saveWatch(expressions);
    this.publish();
    await this.evaluateWatch(this._snapshot, [expression]);
  }

  removeWatch(index: number) {
    this._watchEditing = null;
    this.saveWatch(this.expressions.filter((_, i) => i !== index));
    this.publish();
  }

  editWatch(index: number | null) {
    this._watchEditing = index;
    this.publish();
  }

  evaluate(
    expression: string,
    context: "watch" | "hover",
  ): Promise<WatchResult | null> {
    const snapshot = this._snapshot;
    return snapshot
      ? this.evaluateIn(snapshot, expression, context)
      : Promise.resolve(null);
  }

  protected close() {
    this.replace(null);
    this._frames = [];
    this._accepted = new Map();
    this._watchEditing = null;
    this.publish();
  }

  protected replace(snapshot: Snapshot | null) {
    const previous = this._snapshot;
    if (previous) {
      previous.retired = true;
    }
    this._snapshot = snapshot;
    if (snapshot && previous) {
      snapshot.previous = previous.loading ? previous.previous : previous;
    }
  }

  protected async open(frameId: number | null) {
    const snapshot = new Snapshot(frameId, this._options.request, () =>
      this.publish(),
    );
    this.replace(snapshot);
    this.publish();
    if (frameId != null) {
      const response = await snapshot.ask<DebugProtocol.ScopesResponse>(
        "scopes",
        { frameId },
      );
      const scopes = [
        ...(response?.success ? (response.body?.scopes ?? []) : []),
      ].sort((a, b) => scopeRank(a) - scopeRank(b));
      snapshot.scopes = scopes.map((scope) =>
        snapshot.add(
          this.place(this._root, scope.name, !scope.expensive),
          null,
          scope.variablesReference,
          { scope },
        ),
      );
      await this.loadOpen(snapshot, snapshot.scopes);
    }
    snapshot.loading = false;
    snapshot.changed();
    await this.mark(snapshot);
    await this.evaluateWatch(snapshot, this.expressions);
    snapshot.previous = null;
    snapshot.changed();
  }

  protected async loadOpen(snapshot: Snapshot, roots: readonly Row[]) {
    const tried = new Set<Row>();
    const waiting = () => {
      const found: Row[] = [];
      const visit = (row: Row) => {
        if (row.ref <= 0 || !isOpen(row.place)) {
          return;
        }
        if (row.children) {
          row.children.forEach(visit);
        } else if (!tried.has(row)) {
          found.push(row);
        }
      };
      roots.forEach(visit);
      return found;
    };
    for (let rows = waiting(); rows.length; rows = waiting()) {
      for (const row of rows) {
        tried.add(row);
        await this.load(snapshot, row);
      }
    }
  }

  protected async load(snapshot: Snapshot, row: Row) {
    const response = await snapshot.ask<DebugProtocol.VariablesResponse>(
      "variables",
      { variablesReference: row.ref },
    );
    if (!response?.success) {
      row.message = refusal(response);
      return;
    }
    row.children = (response.body?.variables ?? []).map((variable) =>
      snapshot.add(
        this.place(row.place, variable.name, false),
        row,
        variable.variablesReference,
        { variable },
      ),
    );
  }

  protected async applyBreak(
    snapshot: Snapshot | null,
    key: string,
    on: boolean,
  ) {
    if (!snapshot || snapshot.retired || snapshot.loading) {
      return;
    }
    const row = this.row(snapshot, key);
    if (!row?.parent) {
      return;
    }
    const accepted = new Map(this._accepted);
    if (on) {
      const info = await this.dataBreakpointInfo(snapshot, row);
      if (!info) {
        return;
      }
      const dataId = info.success ? info.body?.dataId : null;
      if (!dataId) {
        this.note(
          snapshot,
          row,
          info.success ? info.body?.description || refusal(null) : refusal(info),
        );
        return;
      }
      accepted.set(dataId, row.place);
    } else {
      if (row.mark === undefined) {
        return;
      }
      accepted.delete(row.mark);
    }
    const response = await this._options.request("setDataBreakpoints", {
      breakpoints: [...accepted.keys()].map((dataId) => ({
        dataId,
        accessType: "write",
      })),
    });
    if (!response?.success) {
      if (response) {
        this.note(snapshot, row, refusal(response));
      }
      return;
    }
    this._accepted = accepted;
    if (this._snapshot) {
      await this.mark(this._snapshot);
    }
  }

  protected dataBreakpointInfo(snapshot: Snapshot, row: Row) {
    return snapshot.ask<DebugProtocol.DataBreakpointInfoResponse>(
      "dataBreakpointInfo",
      { variablesReference: row.parent?.ref, name: row.place.name },
    );
  }

  protected mark(snapshot: Snapshot) {
    const run = snapshot.marking.then(() => this.deriveMarks(snapshot));
    snapshot.marking = run.catch(() => {});
    return run;
  }

  protected async deriveMarks(snapshot: Snapshot) {
    if (snapshot.loading) {
      return;
    }
    const watched = new Set(this._accepted.values());
    const marks = new Map<Row, string>();
    for (const scope of snapshot.scopes) {
      if (scope.scope?.expensive) {
        continue;
      }
      for (const row of scope.children ?? []) {
        if (!watched.has(row.place)) {
          continue;
        }
        const info = await this.dataBreakpointInfo(snapshot, row);
        if (!info) {
          return;
        }
        const dataId = info.success ? info.body?.dataId : null;
        if (dataId && this._accepted.has(dataId)) {
          marks.set(row, dataId);
        }
      }
    }
    for (const row of snapshot.rows.values()) {
      row.mark = marks.get(row);
    }
    snapshot.changed();
  }

  protected async evaluateWatch(
    snapshot: Snapshot | null,
    expressions: readonly string[],
  ) {
    if (!snapshot) {
      return;
    }
    for (const expression of new Set(expressions)) {
      const result = await this.evaluateIn(snapshot, expression, "watch");
      if (result) {
        snapshot.watch.set(expression, result);
        snapshot.changed();
      }
    }
  }

  protected async evaluateIn(
    snapshot: Snapshot,
    expression: string,
    context: "watch" | "hover",
  ): Promise<WatchResult | null> {
    if (this._status !== "paused" || snapshot.frameId == null) {
      return null;
    }
    const response = await snapshot.ask<DebugProtocol.EvaluateResponse>(
      "evaluate",
      { expression, frameId: snapshot.frameId, context },
    );
    if (!response) {
      return null;
    }
    if (!response.success) {
      return { error: response.message || DEBUG_INSPECTION_TEXT.noValue };
    }
    return response.body.type === "undefined"
      ? { error: DEBUG_WATCH_TEXT.unavailable }
      : { value: response.body.result };
  }

  protected place(parent: Place | null, name: string, openByDefault: boolean) {
    const known = parent?.children.get(name);
    if (known) {
      return known;
    }
    const place: Place = {
      id: `d${this._places.size}`,
      name,
      children: new Map(),
      openByDefault,
    };
    this._places.set(place.id, place);
    parent?.children.set(name, place);
    return place;
  }

  protected row(snapshot: Snapshot, key: string) {
    const place = this._places.get(key);
    return snapshot.loading || !place ? undefined : snapshot.rows.get(place);
  }

  protected note(snapshot: Snapshot, row: Row, message: string) {
    row.message = message;
    snapshot.changed();
  }

  protected saveWatch(expressions: readonly string[]) {
    this._options.saveWatch?.(expressions);
  }

  protected tree(snapshot: Snapshot | null): DebugVariableNode[] {
    const shown = snapshot?.loading ? snapshot.previous : snapshot;
    if (!shown) {
      return [];
    }
    const settled = shown === snapshot;
    const node = (row: Row, inScope: boolean, direct: boolean): DebugVariableNode => {
      const expandable = row.ref > 0;
      const expanded = expandable && isOpen(row.place);
      return {
        key: row.place.id,
        name: row.place.name,
        value: row.variable?.value ?? "",
        type: row.variable?.type,
        expandable,
        expanded,
        editable: settled && inScope && !expandable,
        breakable: settled && inScope && direct,
        breaking: settled && row.mark !== undefined,
        message: settled ? row.message : undefined,
        children:
          expanded && row.children
            ? row.children.map((child) => node(child, inScope, false))
            : undefined,
      };
    };
    return shown.scopes.map((scope) => {
      const expanded = isOpen(scope.place);
      const inScope = !scope.scope?.expensive;
      return {
        key: scope.place.id,
        name: scope.place.name,
        value: "",
        expandable: true,
        expanded,
        editable: false,
        breakable: false,
        breaking: false,
        message: settled ? scope.message : undefined,
        children:
          expanded && scope.children
            ? scope.children.map((child) => node(child, inScope, true))
            : undefined,
      };
    });
  }

  protected publish() {
    const snapshot = this._snapshot;
    const watch = new Map(snapshot?.previous?.watch);
    for (const [expression, result] of snapshot?.watch ?? []) {
      watch.set(expression, result);
    }
    workspace.debugInspection.value = {
      ...IDLE_DEBUG_INSPECTION,
      status: this._status,
      frames: this._frames,
      frameId: snapshot?.frameId ?? null,
      variables: this.tree(snapshot),
      editing: snapshot?.editing?.id ?? null,
      watch,
      watchEditing: this._watchEditing,
    };
  }
}
