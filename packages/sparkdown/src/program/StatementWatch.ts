export class StatementWatch {
  readonly changed = new Set<object>();

  protected _watched = new WeakMap<
    object,
    { block: object; value: string; read: (obj: any) => string }
  >();

  watch(obj: object, block: object, read: (obj: any) => string): void {
    this._watched.set(obj, { block, value: read(obj), read });
  }

  note(obj: object): void {
    const watched = this._watched.get(obj);
    if (watched && watched.read(obj) !== watched.value) {
      this.changed.add(watched.block);
    }
  }
}

let active: StatementWatch | null = null;

export const watchStatements = (
  watch: StatementWatch | null,
): StatementWatch | null => {
  const previous = active;
  active = watch;
  return previous;
};

export const noteResolved = (obj: object): void => {
  active?.note(obj);
};

const ids = new WeakMap<object, number>();
let nextId = 0;

export const identityOf = (obj: object | null | undefined): string => {
  if (!obj) {
    return "-";
  }
  let id = ids.get(obj);
  if (id === undefined) {
    id = nextId++;
    ids.set(obj, id);
  }
  return String(id);
};
