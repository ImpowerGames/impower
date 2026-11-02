import type { InkObject } from "../runtime/Object";
import {
  NullValue,
  ObjectValue,
  VariablePointerValue,
  type AbstractValue,
} from "../runtime/Value";
import { addressOf, chunkId } from "./ProgramChunk";
import { countsSave } from "./ProgramSave";
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
  let value = story.state.variablesState.GetVariableWithName(path[0]!) as
    | InkObject
    | null
    | undefined;
  for (const field of path.slice(1)) {
    value = value instanceof ObjectValue ? (fieldOf(value, field) ?? null) : undefined;
  }
  return value;
};

interface FrameScopes {
  scopes: Map<string, InkObject>[];
  frame: SavedFrame;
}

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
  const places = new Map<string, number>();
  for (const [key, countId] of targets.counts) {
    values[key] = String(story.state.VisitCount(countId));
    if (key.startsWith("place:")) {
      places.set(key, countId);
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
  return { values, frames, places: countsSave(story.root, places) };
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
    const countId = targets.counts.get(key);
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
