export interface Text {
  length: number;
  lines: number;
}

export type SerializableChangeSet = [number, [number, ...string[]], number];

export interface ChangeDesc {
  sections: number[];
}

export interface StateEffectType<Value> {
  map: (value: Value, mapping: ChangeDesc) => Value | undefined;
}

export interface StateEffect<Value> {
  type: StateEffectType<Value>;
  value: Value;
}

export interface SelectionRange {
  anchor: number;
  head: number;
}

export interface SerializableEditorSelection {
  ranges: SelectionRange[];
  main: number;
}

export interface SerializableDiagnostic {
  from: number;
  to: number;
  severity: "info" | "warning" | "error";
  source?: string;
  message: string;
}

export interface HistoryEvent {
  changes?: SerializableChangeSet;
  effects: StateEffect<unknown>[];
  mapped?: ChangeDesc;
  startSelection?: SerializableEditorSelection;
  selectionsAfter: SerializableEditorSelection[];
}

export interface SerializableHistoryState {
  done: HistoryEvent[];
  undone: HistoryEvent[];
}

export interface SerializableEditorState {
  readonly doc: string;
  readonly selection: SerializableEditorSelection;
  readonly history: SerializableHistoryState;
  readonly userEvent?: string;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly snippet?: boolean;
  readonly diagnostics?: SerializableDiagnostic[];
}
