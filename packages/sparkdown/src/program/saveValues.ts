import type { InkObject } from "../runtime/Object";
import {
  NullValue,
  ObjectValue,
  VariablePointerValue,
  type AbstractValue,
} from "../runtime/Value";
import { addressOf, chunkId } from "./ProgramChunk";
import type { ProgramRoot } from "./ProgramRoot";
import { countsSave, placeCounts, type SavedFrameScopes } from "./ProgramSave";
import type { ProgramStory } from "./ProgramStory";
import { localKey, readLocalKey, type SavedFrame, type SaveValues } from "./saveValueSet";
import {
  SEED_KEY,
  formatLiteral,
  parseLiteral,
  type StartingValueSet,
} from "./startingValueLiterals";
import {
  fieldOf,
  literalOfValue,
  parametersOf,
  startingValueTargets,
  valueOfLiteral,
  type StartingValueSource,
} from "./startingValues";

const literalText = (value: InkObject | null | undefined): string | undefined => {
  const literal = literalOfValue(value);
  return literal === undefined ? undefined : formatLiteral(literal);
};

const storeValue = (
  story: ProgramStory,
  path: string[],
): InkObject | null | undefined => {
  let value: InkObject | null | undefined =
    story.state.variablesState.GetGlobalVariableValue(path[0]!);
  for (const field of path.slice(1)) {
    value = value instanceof ObjectValue ? (fieldOf(value, field) ?? null) : undefined;
  }
  return value;
};

interface FrameScopes {
  scopes: Map<string, InkObject>[];
  frame: SavedFrame;
}

const entryOf = (
  root: ProgramRoot,
  entry: string | undefined,
): Pick<SavedFrame, "entry" | "entryScene"> => {
  const sequence = entry ? root.flowNamed(entry) : undefined;
  const entryScene = sequence ? root.sceneOf(sequence) : undefined;
  return {
    ...(entry ? { entry } : {}),
    ...(entryScene ? { entryScene } : {}),
  };
};

const framesOf = (story: ProgramStory): FrameScopes[] => {
  const state = story.state;
  const root = story.root;
  const elements = state.callStack.currentThread.callstack;
  return elements.map((element, i) => {
    const position =
      i === elements.length - 1
        ? state.position
        : state.frameOf(elements[i + 1]!)?.returnTo;
    const chunk = position?.sequence.arrays.chunks[position.entry];
    const address =
      position && chunk ? addressOf(chunkId(chunk), position.offset) : undefined;
    const frame: SavedFrame = { params: {} };
    if (address !== undefined) {
      const location = root.locationOf(address);
      if (location) {
        frame.uri = location.uri;
        frame.line = location.startLine;
      }
      const flow = root.flowAt(address);
      if (flow && flow.flow >= 0) {
        frame.flow = root.table.symbols[flow.flow];
      }
      frame.scene = root.sceneAt(address);
    }
    const symbol = state.frameOf(element)?.symbol;
    if (symbol !== undefined) {
      Object.assign(frame, entryOf(root, root.table.symbols[symbol]));
    }
    return {
      scopes: element.temporaryScopes as Map<string, InkObject>[],
      frame,
    };
  });
};

const scopedValue = (
  scopes: Map<string, InkObject>[],
  name: string,
): InkObject | null | undefined => {
  for (let s = scopes.length - 1; s >= 0; s -= 1) {
    if (scopes[s]!.has(name)) {
      return scopes[s]!.get(name) ?? null;
    }
  }
  return undefined;
};

export const readStoryValues = (
  story: ProgramStory,
  source: StartingValueSource,
): SaveValues => {
  const values: StartingValueSet = {};
  const targets = startingValueTargets(story, source);
  for (const [key, path] of targets.stores) {
    const text = literalText(storeValue(story, path));
    if (text !== undefined) {
      values[key] = text;
    }
  }
  for (const [key, countId] of targets.counts) {
    const visits = story.state.VisitCount(countId);
    if (!isPlaceKey(key) || visits > 0) {
      values[key] = String(visits);
    }
  }
  values[SEED_KEY] = String(story.state.storySeed);
  const frames = framesOf(story).map(({ scopes, frame }, i) => {
    const seen = new Set<string>();
    for (let s = scopes.length - 1; s >= 0; s -= 1) {
      for (const [name, value] of scopes[s]!) {
        if (name.includes("$") || seen.has(name)) {
          continue;
        }
        seen.add(name);
        if (value instanceof VariablePointerValue) {
          continue;
        }
        const text = literalText(value);
        if (text !== undefined) {
          values[localKey(i, name)] = text;
        }
      }
    }
    const names = new Set([
      ...(frame.flow ? parametersOf(story.root, frame.flow) : []),
      ...(frame.scene ? parametersOf(story.root, frame.scene) : []),
    ]);
    for (const name of names) {
      const value = scopedValue(scopes, name);
      const text = value === undefined ? undefined : literalText(value);
      if (text !== undefined) {
        frame.params[name] = text;
      }
    }
    return frame;
  });
  return { values, frames };
};

export const applySaveValueChanges = (
  story: ProgramStory,
  source: StartingValueSource,
  changes: Readonly<StartingValueSet>,
): void => {
  const state = story.state;
  const variables = state.variablesState;
  const targets = startingValueTargets(story, source);
  const frames = framesOf(story);
  for (const [key, text] of Object.entries(changes)) {
    const parsed = parseLiteral(text);
    if (!parsed.ok) {
      continue;
    }
    const literal = parsed.value;
    if (key === SEED_KEY) {
      if (typeof literal === "number" && Number.isInteger(literal)) {
        state.storySeed = literal;
        state.previousRandom = 0;
      }
      continue;
    }
    const countId = isFormKey(key) ? countOfFormKey(story.root, key) : targets.counts.get(key);
    if (countId !== undefined) {
      if (typeof literal === "number" && Number.isInteger(literal) && literal >= 0) {
        const unvisited = state.VisitCount(countId) === 0;
        state.SetCount(
          countId,
          literal,
          literal > 0 && unvisited ? state.currentTurnIndex : null,
        );
      }
      continue;
    }
    const path = targets.stores.get(key);
    if (path) {
      const value = valueOfLiteral(literal);
      if (path.length === 1) {
        variables.SetGlobal(path[0]!, value);
        continue;
      }
      const table = storeValue(story, path.slice(0, -1));
      if (table instanceof ObjectValue) {
        variables.WriteBarrier(table);
        const map = table.value as Map<string, AbstractValue>;
        if (value instanceof NullValue) {
          map.delete(path.at(-1)!);
        } else {
          map.set(path.at(-1)!, value);
        }
      }
      continue;
    }
    const local = readLocalKey(key);
    const scopes = local ? frames[local.frame]?.scopes : undefined;
    if (local && scopes) {
      for (let s = scopes.length - 1; s >= 0; s -= 1) {
        const current = scopes[s]!.get(local.name);
        if (scopes[s]!.has(local.name)) {
          if (!(current instanceof VariablePointerValue)) {
            scopes[s]!.set(local.name, valueOfLiteral(literal));
          }
          break;
        }
      }
    }
  }
};

const FORM_PREFIX = "form:";

export const isPlaceKey = (key: string): boolean => key.startsWith("place:");

export const isFormKey = (key: string): boolean => key.startsWith(FORM_PREFIX);

export const countFormKey = (root: ProgramRoot, countId: number): string =>
  `${FORM_PREFIX}${countsSave(root, new Map([["c", countId]]))}`;

export const countOfFormKey = (root: ProgramRoot, key: string): number | undefined =>
  placeCounts(root, key.slice(FORM_PREFIX.length)).get("c");

export const formKeyedValues = (
  story: ProgramStory,
  source: StartingValueSource,
  values: Readonly<StartingValueSet>,
): StartingValueSet => {
  const counts = startingValueTargets(story, source).counts;
  const out: StartingValueSet = {};
  for (const [key, value] of Object.entries(values)) {
    const countId = isPlaceKey(key) ? counts.get(key) : undefined;
    out[countId === undefined ? key : countFormKey(story.root, countId)] = value;
  }
  return out;
};

export const lineKeyedValues = (
  story: ProgramStory,
  source: StartingValueSource,
  values: Readonly<StartingValueSet>,
): StartingValueSet => {
  const lineKeyOf = new Map<number, string>();
  for (const [key, countId] of startingValueTargets(story, source).counts) {
    if (isPlaceKey(key)) {
      lineKeyOf.set(countId, key);
    }
  }
  const out: StartingValueSet = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isFormKey(key)) {
      out[key] = value;
      continue;
    }
    const countId = countOfFormKey(story.root, key);
    const lineKey = countId === undefined ? undefined : lineKeyOf.get(countId);
    if (lineKey !== undefined) {
      out[lineKey] = value;
    }
  }
  return out;
};

export const savedFrameValues = (
  story: ProgramStory,
  frames: readonly SavedFrameScopes[],
  edits: readonly [string, string][] = [],
): SaveValues => {
  const values: StartingValueSet = {};
  const saved = frames.map(({ flow, entry, scopes }, i) => {
    const seen = new Set<string>();
    for (let s = scopes.length - 1; s >= 0; s -= 1) {
      for (const [name, value] of scopes[s]!) {
        if (name.includes("$") || seen.has(name)) {
          continue;
        }
        seen.add(name);
        if (value instanceof VariablePointerValue) {
          continue;
        }
        const text = literalText(value);
        if (text !== undefined) {
          values[localKey(i, name)] = text;
        }
      }
    }
    const sequence = flow ? story.root.flowNamed(flow) : undefined;
    const scene = sequence ? story.root.sceneOf(sequence) : undefined;
    const params: Record<string, string> = {};
    const names = new Set([
      ...(flow ? parametersOf(story.root, flow) : []),
      ...(scene ? parametersOf(story.root, scene) : []),
    ]);
    for (const name of names) {
      const value = scopedValue(scopes, name);
      const text = value === undefined ? undefined : literalText(value);
      if (text !== undefined) {
        params[name] = text;
      }
    }
    return {
      ...(flow ? { flow } : {}),
      ...(scene ? { scene } : {}),
      ...entryOf(story.root, entry),
      params,
    } as SavedFrame;
  });
  for (const [key, value] of edits) {
    const local = readLocalKey(key);
    if (!local || !Object.hasOwn(values, key)) {
      continue;
    }
    values[key] = value;
    const frame = saved[local.frame];
    if (frame && Object.hasOwn(frame.params, local.name)) {
      frame.params[local.name] = value;
    }
  }
  return { values, frames: saved };
};
