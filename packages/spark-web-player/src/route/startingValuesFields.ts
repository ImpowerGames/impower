import {
  changeStartingValues,
  ownEntry,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";

export interface PendingChange {
  edit: number;
  value: string | null;
}

export interface SentChange {
  edit: number;
  changes: Record<string, string | null>;
}

export interface FieldState {
  draft?: string;
  pending?: PendingChange;
  refused?: string;
}

export interface StartingValuesFields {
  kept?: StartingValues;
  fields: ReadonlyMap<string, FieldState>;
  settled: ReadonlyMap<string, number>;
  edits: number;
}

export interface FieldsView {
  values: Record<string, string>;
  drafts: Record<string, string>;
  unsaved: Record<string, string>;
}

const fieldId = (start: string, key: string) => `${start}\n${key}`;

const splitId = (id: string): [start: string, key: string] => {
  const at = id.indexOf("\n");
  return [id.slice(0, at), id.slice(at + 1)];
};

const isEmpty = (field: FieldState) =>
  field.draft === undefined &&
  field.pending === undefined &&
  field.refused === undefined;

const withFields = (
  state: StartingValuesFields,
  change: (fields: Map<string, FieldState>) => void,
): StartingValuesFields => {
  const fields = new Map(state.fields);
  change(fields);
  for (const [id, field] of fields) {
    if (isEmpty(field)) {
      fields.delete(id);
    }
  }
  return { ...state, fields };
};

const fieldsOf = (state: StartingValuesFields, start: string) =>
  [...state.fields].flatMap(([id, field]) => {
    const [fieldStart, key] = splitId(id);
    return fieldStart === start ? [[key, field] as const] : [];
  });

export const emptyFields = (): StartingValuesFields => ({
  fields: new Map(),
  settled: new Map(),
  edits: 0,
});

export const shownValues = (
  state: StartingValuesFields,
): StartingValues | undefined => {
  if (!state.kept) {
    return undefined;
  }
  let values = state.kept;
  for (const [id, field] of state.fields) {
    if (field.pending) {
      const [start, key] = splitId(id);
      values = changeStartingValues(values, start, {
        [key]: field.pending.value,
      });
    }
  }
  return values;
};

export const fieldsView = (
  state: StartingValuesFields,
  start: string,
): FieldsView => {
  const drafts: Record<string, string> = {};
  const unsaved: Record<string, string> = {};
  for (const [key, field] of fieldsOf(state, start)) {
    if (field.draft !== undefined) {
      drafts[key] = field.draft;
    }
    if (field.refused !== undefined) {
      unsaved[key] = field.refused;
    }
  }
  return {
    values: { ...ownEntry(shownValues(state), start) },
    drafts,
    unsaved,
  };
};

export const drafted = (
  state: StartingValuesFields,
  start: string,
  key: string,
  text: string | null,
): StartingValuesFields =>
  withFields(state, (fields) => {
    const field = fields.get(fieldId(start, key)) ?? {};
    fields.set(fieldId(start, key), {
      ...field,
      draft: text ?? undefined,
    });
  });

export const changed = (
  state: StartingValuesFields,
  start: string,
  changes: Record<string, string | null>,
): { state: StartingValuesFields } & SentChange => {
  const edit = state.edits + 1;
  const next = withFields({ ...state, edits: edit }, (fields) => {
    for (const [key, value] of Object.entries(changes)) {
      fields.set(fieldId(start, key), { pending: { edit, value } });
    }
  });
  return { state: next, edit, changes };
};

export const answered = (
  state: StartingValuesFields,
  start: string,
  sent: SentChange,
  kept: boolean,
  firstOf: (key: string) => string | undefined,
): StartingValuesFields => {
  const settled = new Map(state.settled);
  const newer: Record<string, string | null> = {};
  if (kept) {
    for (const [key, value] of Object.entries(sent.changes)) {
      if ((settled.get(fieldId(start, key)) ?? 0) < sent.edit) {
        settled.set(fieldId(start, key), sent.edit);
        newer[key] = value;
      }
    }
  }
  const next = kept
    ? {
        ...state,
        settled,
        kept: changeStartingValues(state.kept ?? {}, start, newer),
      }
    : state;
  return withFields(next, (fields) => {
    for (const [key, field] of fieldsOf(state, start)) {
      if (field.pending?.edit !== sent.edit) {
        continue;
      }
      fields.set(
        fieldId(start, key),
        kept
          ? { draft: field.draft }
          : {
              draft: field.draft,
              refused:
                ownEntry(state.kept, start)?.[key] ?? firstOf(key) ?? "nil",
            },
      );
    }
  });
};

export const hostSent = (
  state: StartingValuesFields,
  values: StartingValues,
): StartingValuesFields => {
  const settled = new Map(state.settled);
  return withFields({ ...state, kept: values, settled }, (fields) => {
    for (const [id, field] of state.fields) {
      const [start, key] = splitId(id);
      const now = ownEntry(values, start)?.[key];
      const pending =
        field.pending && now !== (field.pending.value ?? undefined)
          ? field.pending
          : undefined;
      if (field.pending && !pending) {
        settled.set(id, Math.max(settled.get(id) ?? 0, field.pending.edit));
      }
      fields.set(id, {
        draft: field.draft,
        pending,
        refused: now === undefined ? field.refused : undefined,
      });
    }
  });
};

export const startChanged = (
  state: StartingValuesFields,
  start: string | undefined,
): StartingValuesFields =>
  withFields(state, (fields) => {
    for (const [id, field] of state.fields) {
      if (splitId(id)[0] !== start) {
        fields.set(id, { pending: field.pending });
      }
    }
  });

export const resetAll = (
  state: StartingValuesFields,
  start: string,
): { state: StartingValuesFields; changes: Record<string, string | null> } => {
  const changes = Object.fromEntries(
    Object.keys(ownEntry(shownValues(state), start) ?? {}).map((key) => [
      key,
      null,
    ]),
  );
  const next = withFields(state, (fields) => {
    for (const [key, field] of fieldsOf(state, start)) {
      fields.set(fieldId(start, key), { ...field, draft: undefined });
    }
  });
  return { state: next, changes };
};
