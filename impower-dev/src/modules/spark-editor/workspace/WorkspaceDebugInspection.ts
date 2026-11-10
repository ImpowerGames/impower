import type { DebugFrameEntry } from "@impower/spark-web-player/src/components/DebugCallStack/DebugCallStack";
import type { DebugVariableNode } from "@impower/spark-web-player/src/components/DebugVariables/DebugVariables";
import type { DebugWatchEntry } from "@impower/spark-web-player/src/components/DebugWatch/DebugWatch";
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

const SEPARATOR = "/";

const scopeKey = (scope: DebugProtocol.Scope) => `scope:${scope.name}`;

const childKey = (parent: string, name: string) => `${parent}${SEPARATOR}${name}`;

const parentOf = (key: string) => key.slice(0, key.lastIndexOf(SEPARATOR));

const nameOf = (key: string) => key.slice(key.lastIndexOf(SEPARATOR) + 1);

const scopeRank = (scope: DebugProtocol.Scope) =>
  scope.expensive ? 2 : scope.presentationHint === "locals" ? 1 : 0;

const defaultSource = (uri: string): DebugSource => ({
  path: uri.slice(uri.lastIndexOf("/") + 1),
  inProject: Boolean(uri),
});

const expandedOf = (
  state: DebugInspectionState,
  key: string,
  fallback: boolean,
) => state.expanded[key] ?? fallback;

const refusal = (response: DebugProtocol.Response | null) =>
  response?.message || DEBUG_INSPECTION_TEXT.refused;

const breakKey = (state: DebugInspectionState, key: string) => {
  const scope = state.scopes.find(
    (s) => key.startsWith(`${scopeKey(s)}${SEPARATOR}`),
  );
  if (scope?.presentationHint !== "locals") {
    return key;
  }
  const frame = state.frames.find((f) => f.id === state.frameId);
  return `${frame?.name ?? ""}@${key}`;
};

export function variableTree(state: DebugInspectionState): DebugVariableNode[] {
  const nodes = (
    parent: string,
    list: readonly DebugProtocol.Variable[],
    inScope: boolean,
  ): DebugVariableNode[] =>
    list.map((variable) => {
      const key = childKey(parent, variable.name);
      const expandable = variable.variablesReference > 0;
      const expanded = expandable && expandedOf(state, key, false);
      const children = state.variables[key];
      return {
        key,
        name: variable.name,
        value: variable.value,
        type: variable.type,
        expandable,
        expanded,
        editable: inScope && !expandable,
        breakable: inScope,
        breaking: breakKey(state, key) in state.breaking,
        message: state.messages[key],
        children: expanded && children ? nodes(key, children, false) : undefined,
      };
    });
  return state.scopes.map((scope) => {
    const key = scopeKey(scope);
    const expanded = expandedOf(state, key, !scope.expensive);
    const children = state.variables[key];
    return {
      key,
      name: scope.name,
      value: "",
      expandable: true,
      expanded,
      editable: false,
      breakable: false,
      breaking: false,
      message: state.messages[key],
      children:
        expanded && children ? nodes(key, children, !scope.expensive) : undefined,
    };
  });
}

export function watchEntries(
  state: DebugInspectionState,
  expressions: readonly string[],
): DebugWatchEntry[] {
  return expressions.map((expression, index) => {
    const result = state.watch[expression];
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
  protected _generation = 0;

  constructor(protected readonly _options: WorkspaceDebugInspectionOptions) {}

  get state(): DebugInspectionState {
    return workspace.debugInspection.peek();
  }

  get expressions(): readonly string[] {
    return workspace.watchExpressions.peek();
  }

  begin() {
    this._generation += 1;
    this.update({
      ...IDLE_DEBUG_INSPECTION,
      status: "running",
      expanded: this.state.expanded,
    });
  }

  end() {
    this._generation += 1;
    this.update({ ...IDLE_DEBUG_INSPECTION, expanded: this.state.expanded });
  }

  resume() {
    if (this.state.status === "none") {
      return;
    }
    this._generation += 1;
    this.update({
      status: "running",
      frames: [],
      frameId: null,
      scopes: [],
      variables: {},
      refs: {},
      messages: {},
      editing: null,
      watch: {},
    });
  }

  stopped(stack: DebugProtocol.StackTraceResponse["body"]) {
    const source = this._options.source ?? defaultSource;
    const frames: InspectedFrame[] = stack.stackFrames.map((frame) => {
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
    this.update({
      status: "paused",
      frames,
      frameId: frames[0]?.id ?? null,
      messages: {},
      editing: null,
    });
    return this.refresh();
  }

  async selectFrame(frameId: number) {
    if (
      this.state.status !== "paused" ||
      !this.state.frames.some((frame) => frame.id === frameId)
    ) {
      return;
    }
    this.update({ frameId, messages: {}, editing: null });
    await this.refresh();
  }

  async refresh() {
    const generation = ++this._generation;
    const { frameId } = this.state;
    let scopes: DebugProtocol.Scope[] = [];
    const loaded = { variables: {}, refs: {} } as {
      variables: Record<string, readonly DebugProtocol.Variable[]>;
      refs: Record<string, number>;
    };
    if (frameId != null) {
      const response = (await this._options.request("scopes", {
        frameId,
      })) as DebugProtocol.ScopesResponse | null;
      if (generation !== this._generation) {
        return;
      }
      scopes = [...(response?.success ? (response.body?.scopes ?? []) : [])].sort(
        (a, b) => scopeRank(a) - scopeRank(b),
      );
      for (const scope of scopes) {
        const key = scopeKey(scope);
        loaded.refs[key] = scope.variablesReference;
        if (expandedOf(this.state, key, !scope.expensive)) {
          await this.load(key, scope.variablesReference, loaded, generation);
        }
      }
      if (generation !== this._generation) {
        return;
      }
    }
    this.update({ scopes, variables: loaded.variables, refs: loaded.refs });
    await this.evaluateWatch(this.expressions, generation);
  }

  async toggle(key: string) {
    const scope = this.state.scopes.find((s) => scopeKey(s) === key);
    const expanded = expandedOf(this.state, key, scope ? !scope.expensive : false);
    this.update({ expanded: { ...this.state.expanded, [key]: !expanded } });
    const ref = this.state.refs[key];
    if (expanded || ref == null || this.state.variables[key]) {
      return;
    }
    const generation = this._generation;
    const loaded = { variables: {}, refs: {} };
    await this.load(key, ref, loaded, generation);
    if (generation === this._generation) {
      this.update({
        variables: { ...this.state.variables, ...loaded.variables },
        refs: { ...this.state.refs, ...loaded.refs },
      });
    }
  }

  edit(key: string | null) {
    const messages = { ...this.state.messages };
    if (key) {
      delete messages[key];
    }
    this.update({ editing: key, messages });
  }

  async setValue(key: string, value: string) {
    const generation = this._generation;
    this.update({ editing: null });
    const response = await this._options.request("setVariable", {
      variablesReference: this.state.refs[parentOf(key)],
      name: nameOf(key),
      value,
    });
    if (!response || generation !== this._generation) {
      return;
    }
    if (!response.success) {
      this.note(key, refusal(response));
      return;
    }
    await this.refresh();
  }

  async breakOnChange(key: string, on: boolean) {
    const generation = this._generation;
    const breaking = { ...this.state.breaking };
    const at = breakKey(this.state, key);
    if (on) {
      const info = (await this._options.request("dataBreakpointInfo", {
        variablesReference: this.state.refs[parentOf(key)],
        name: nameOf(key),
      })) as DebugProtocol.DataBreakpointInfoResponse | null;
      if (!info || generation !== this._generation) {
        return;
      }
      const dataId = info.success ? info.body?.dataId : null;
      if (!dataId) {
        this.note(key, info.success ? info.body?.description || refusal(null) : refusal(info));
        return;
      }
      breaking[at] = dataId;
    } else {
      delete breaking[at];
    }
    const response = await this._options.request("setDataBreakpoints", {
      breakpoints: [...new Set(Object.values(breaking))].map((dataId) => ({
        dataId,
        accessType: "write",
      })),
    });
    if (!response || generation !== this._generation) {
      return;
    }
    if (!response.success) {
      this.note(key, refusal(response));
      return;
    }
    this.update({ breaking });
  }

  async addWatch(expression: string) {
    this.saveWatch([...this.expressions, expression]);
    await this.evaluateWatch([expression], this._generation);
  }

  async changeWatch(index: number, expression: string) {
    const expressions = [...this.expressions];
    if (index < 0 || index >= expressions.length) {
      return;
    }
    expressions[index] = expression;
    this.update({ watchEditing: null });
    this.saveWatch(expressions);
    await this.evaluateWatch([expression], this._generation);
  }

  removeWatch(index: number) {
    this.update({ watchEditing: null });
    this.saveWatch(this.expressions.filter((_, i) => i !== index));
  }

  editWatch(index: number | null) {
    this.update({ watchEditing: index });
  }

  async evaluate(
    expression: string,
    context: "watch" | "hover",
  ): Promise<WatchResult | null> {
    const { status, frameId } = this.state;
    if (status !== "paused" || frameId == null) {
      return null;
    }
    const response = (await this._options.request("evaluate", {
      expression,
      frameId,
      context,
    })) as DebugProtocol.EvaluateResponse | null;
    if (!response) {
      return null;
    }
    return response.success
      ? { value: response.body.result }
      : { error: response.message || DEBUG_INSPECTION_TEXT.noValue };
  }

  protected async evaluateWatch(
    expressions: readonly string[],
    generation: number,
  ) {
    if (this.state.status !== "paused") {
      return;
    }
    const results: Record<string, WatchResult> = {};
    for (const expression of new Set(expressions)) {
      const result = await this.evaluate(expression, "watch");
      if (generation !== this._generation) {
        return;
      }
      if (result) {
        results[expression] = result;
      }
    }
    this.update({ watch: { ...this.state.watch, ...results } });
  }

  protected async load(
    key: string,
    ref: number,
    into: {
      variables: Record<string, readonly DebugProtocol.Variable[]>;
      refs: Record<string, number>;
    },
    generation: number,
  ) {
    const response = (await this._options.request("variables", {
      variablesReference: ref,
    })) as DebugProtocol.VariablesResponse | null;
    if (generation !== this._generation) {
      return;
    }
    if (!response?.success) {
      this.note(key, refusal(response));
      return;
    }
    const list = response.body?.variables ?? [];
    into.variables[key] = list;
    for (const variable of list) {
      if (variable.variablesReference > 0) {
        const child = childKey(key, variable.name);
        into.refs[child] = variable.variablesReference;
        if (expandedOf(this.state, child, false)) {
          await this.load(child, variable.variablesReference, into, generation);
        }
      }
    }
  }

  protected note(key: string, message: string) {
    this.update({ messages: { ...this.state.messages, [key]: message } });
  }

  protected saveWatch(expressions: readonly string[]) {
    this._options.saveWatch?.(expressions);
  }

  protected update(change: Partial<DebugInspectionState>) {
    workspace.debugInspection.value = { ...this.state, ...change };
  }
}
