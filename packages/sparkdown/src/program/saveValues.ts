import type { InkObject } from "../runtime/Object";
import {
  NullValue,
  ObjectValue,
  VariablePointerValue,
  type AbstractValue,
} from "../runtime/Value";
import { addressOf, chunkId } from "./ProgramChunk";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import { countsSave, placeCounts, type SavedFrameScopes } from "./ProgramSave";
import type { ProgramStory } from "./ProgramStory";
import { flowScopeOwners } from "./ProgramStoryState";
import {
  readLocalKey,
  savedLocals,
  type SavedFrame,
  type SavedScope,
  type SaveValues,
} from "./saveValueSet";
import {
  SEED_KEY,
  formatLiteral,
  parseLiteral,
  type StartingValueSet,
} from "./startingValueLiterals";
import {
  fieldOf,
  literalOfValue,
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

type FrameMaps = readonly (readonly Map<string, InkObject>[])[];

const pointedScope = (
  frames: FrameMaps,
  pointer: VariablePointerValue,
): Map<string, InkObject> | undefined => {
  const scope = pointer.isClosed
    ? undefined
    : frames[pointer.contextIndex - 1]?.[pointer.scopeIndex];
  return scope?.has(pointer.variableName) ? scope : undefined;
};

const slotOf = (
  frames: FrameMaps,
  scope: Map<string, InkObject>,
  name: string,
): { scope: Map<string, InkObject>; name: string } | undefined => {
  for (let hops = 0; hops <= frames.length; hops += 1) {
    const value = scope.get(name);
    if (!(value instanceof VariablePointerValue)) {
      return { scope, name };
    }
    const next = pointedScope(frames, value);
    if (!next) {
      return undefined;
    }
    scope = next;
    name = value.variableName;
  }
  return undefined;
};

const pointedValue = (
  frames: FrameMaps,
  value: InkObject | null | undefined,
): InkObject | null | undefined => {
  for (let hops = 0; value instanceof VariablePointerValue && hops <= frames.length; hops += 1) {
    value = value.isClosed
      ? value.closedValue
      : pointedScope(frames, value)?.get(value.variableName);
  }
  return value instanceof VariablePointerValue ? undefined : value;
};

const savedScopesOf = (frames: FrameMaps, scopes: readonly Map<string, InkObject>[]): SavedScope[] =>
  scopes.map((scope) => {
    const saved: SavedScope = {};
    for (const [name, value] of scope) {
      if (!name.includes("$")) {
        saved[name] = literalText(pointedValue(frames, value)) ?? null;
      }
    }
    return saved;
  });

const scopeFlowsOf = (root: ProgramRoot, sequence: SequenceRow): string[] =>
  flowScopeOwners(root, sequence).map((symbol) => root.table.symbols[symbol] ?? "");

const linksOf = (
  frames: FrameMaps,
  index: number,
): Record<string, [number, number]> | undefined => {
  const scopes = frames[index]!;
  const seen = new Set<string>();
  let links: Record<string, [number, number]> | undefined;
  for (let s = scopes.length - 1; s >= 0; s -= 1) {
    for (const [name, value] of scopes[s]!) {
      if (seen.has(name) || name.includes("$")) {
        continue;
      }
      seen.add(name);
      const slot = value instanceof VariablePointerValue ? slotOf(frames, scopes[s]!, name) : undefined;
      const owner = slot ? frames.findIndex((maps) => maps.includes(slot.scope)) : -1;
      if (slot && owner >= 0 && owner !== index && slot.name === name) {
        links ??= {};
        links[name] = [owner, frames[owner]!.indexOf(slot.scope)];
      }
    }
  }
  return links;
};

const framesOf = (story: ProgramStory): FrameScopes[] => {
  const state = story.state;
  const root = story.root;
  const elements = state.callStack.currentThread.callstack;
  const maps = elements.map((element) => element.temporaryScopes as Map<string, InkObject>[]);
  return elements.map((_, i) => {
    const position =
      i === elements.length - 1
        ? state.position
        : state.frameOf(elements[i + 1]!)?.returnTo;
    const chunk = position?.sequence.arrays.chunks[position.entry];
    const address =
      position && chunk ? addressOf(chunkId(chunk), position.offset) : undefined;
    const scopes = maps[i]!;
    const frame: SavedFrame = {
      scopes: savedScopesOf(maps, scopes),
      scopeFlows: position ? scopeFlowsOf(root, position.sequence) : [],
    };
    const links = linksOf(maps, i);
    if (links) {
      frame.links = links;
    }
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
    return { scopes, frame };
  });
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
  const frames = framesOf(story).map(({ frame }) => frame);
  return { values: { ...values, ...savedLocals(frames) }, frames };
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
    const slot =
      local && scopes
        ? localSlotOf(
            frames.map((frame) => frame.scopes),
            scopes,
            local.name,
          )
        : undefined;
    slot?.scope.set(slot.name, valueOfLiteral(literal));
  }
};

const localSlotOf = (
  frames: FrameMaps,
  scopes: readonly Map<string, InkObject>[],
  name: string,
): { scope: Map<string, InkObject>; name: string } | undefined => {
  for (let s = scopes.length - 1; s >= 0; s -= 1) {
    if (scopes[s]!.has(name)) {
      return slotOf(frames, scopes[s]!, name);
    }
  }
  return undefined;
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
  const maps = frames.map(({ scopes }) =>
    (scopes as Map<string, InkObject>[]).map((scope) => new Map(scope)),
  );
  for (const [key, text] of edits) {
    const local = readLocalKey(key);
    const scopes = local ? maps[local.frame] : undefined;
    const slot = local && scopes ? localSlotOf(maps, scopes, local.name) : undefined;
    const parsed = parseLiteral(text);
    if (slot && parsed.ok && literalText(slot.scope.get(slot.name)) !== undefined) {
      slot.scope.set(slot.name, valueOfLiteral(parsed.value));
    }
  }
  const saved = frames.map(({ flow }, i): SavedFrame => {
    const sequence = flow ? story.root.flowNamed(flow) : undefined;
    const scene = sequence ? story.root.sceneOf(sequence) : undefined;
    return {
      ...(flow ? { flow } : {}),
      ...(scene ? { scene } : {}),
      scopes: savedScopesOf(maps, maps[i]!),
      scopeFlows: sequence ? scopeFlowsOf(story.root, sequence) : [],
    };
  });
  return { values: savedLocals(saved), frames: saved };
};
