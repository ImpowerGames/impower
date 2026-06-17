import { InkObject } from "./Object";
import { Container } from "./Container";

// One entry of the property-mutation undo log. `oldValue === undefined`
// means the key was absent before the mutation (so undo deletes it),
// any other value (including null) means restore via `set(key, oldValue)`.
export interface PropertyMutation {
  readonly map: Map<string, InkObject>;
  readonly key: string;
  readonly oldValue: InkObject | undefined;
}

export class StatePatch {
  get globals() {
    return this._globals;
  }
  get changedVariables() {
    return this._changedVariables;
  }
  get visitCounts() {
    return this._visitCounts;
  }
  get turnIndices() {
    return this._turnIndices;
  }
  get propertyMutations() {
    return this._propertyMutations;
  }

  constructor();
  constructor(toCopy: StatePatch | null);
  constructor() {
    if (arguments.length === 1 && arguments[0] !== null) {
      let toCopy = arguments[0] as StatePatch;
      this._globals = new Map(toCopy._globals);
      this._changedVariables = new Set(toCopy._changedVariables);
      this._visitCounts = new Map(toCopy._visitCounts);
      this._turnIndices = new Map(toCopy._turnIndices);
      // The undo log SHARES with the copied patch — when we create a new
      // patch from an existing one during snapshot setup, we want both
      // the original and copy to see the same mutation history, so
      // rollback works consistently regardless of which state is current.
      this._propertyMutations = toCopy._propertyMutations;
    } else {
      this._globals = new Map();
      this._changedVariables = new Set();
      this._visitCounts = new Map();
      this._turnIndices = new Map();
      this._propertyMutations = [];
    }
  }

  // Record an in-place mutation of an ObjectValue's internal Map. Used
  // by the runtime's `StoreIndex` handler when a state snapshot is
  // active (newline lookahead): if the snapshot is later restored, the
  // mutations are undone by walking this log in reverse. ObjectValue
  // maps aren't captured by the snapshot's variable-patch mechanism
  // (which only tracks `SetGlobal` calls), so without this we'd run
  // `obj.field = obj.field + 1` twice across the rewind.
  public RecordPropertyMutation(
    map: Map<string, InkObject>,
    key: string,
    oldValue: InkObject | undefined,
  ) {
    this._propertyMutations.push({ map, key, oldValue });
  }

  // Walk the mutation log in reverse and restore each Map entry to its
  // pre-mutation state. Called from `Story.RestoreStateSnapshot` to undo
  // the speculative writes that happened during newline lookahead.
  public UndoPropertyMutations() {
    for (let i = this._propertyMutations.length - 1; i >= 0; i--) {
      const m = this._propertyMutations[i]!;
      if (m.oldValue === undefined) {
        m.map.delete(m.key);
      } else {
        m.map.set(m.key, m.oldValue);
      }
    }
    this._propertyMutations = [];
  }

  public TryGetGlobal(name: string | null, /* out */ value: InkObject | null) {
    if (name !== null && this._globals.has(name)) {
      return { result: this._globals.get(name), exists: true };
    }

    return { result: value, exists: false };
  }

  public SetGlobal(name: string, value: InkObject) {
    this._globals.set(name, value);
  }

  public AddChangedVariable(name: string) {
    return this._changedVariables.add(name);
  }

  public TryGetVisitCount(container: Container, /* out */ count: number) {
    if (this._visitCounts.has(container)) {
      return { result: this._visitCounts.get(container), exists: true };
    }

    return { result: count, exists: false };
  }

  public SetVisitCount(container: Container, count: number) {
    this._visitCounts.set(container, count);
  }

  public SetTurnIndex(container: Container, index: number) {
    this._turnIndices.set(container, index);
  }

  public TryGetTurnIndex(container: Container, /* out */ index: number) {
    if (this._turnIndices.has(container)) {
      return { result: this._turnIndices.get(container), exists: true };
    }

    return { result: index, exists: false };
  }

  private _globals: Map<string, InkObject>;
  private _changedVariables: Set<string> = new Set();
  private _visitCounts: Map<Container, number> = new Map();
  private _turnIndices: Map<Container, number> = new Map();
  private _propertyMutations: PropertyMutation[];
}
