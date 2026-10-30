import type { ProgramChangeSummary } from "@impower/sparkdown/src/compiler/types/ProgramChangeSummary";
import type {
  LevelZeroWork,
  RouteStep,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import type {
  ChunkPosition,
  ProgramRoot,
  SequenceRow,
} from "@impower/sparkdown/src/program/ProgramRoot";
import { SymbolKind } from "@impower/sparkdown/src/program/ProgramSymbols";
import { chunkOfAddress } from "@impower/sparkdown/src/program/ProgramChunk";

export const validAddressPrefixLength = (
  steps: ReadonlyArray<RouteStep>,
  before: ProgramRoot | undefined,
  after: ProgramRoot,
  changes: ProgramChangeSummary | undefined,
  routedChangeId: number | undefined,
): number => {
  const chunks = changes?.chunks;
  if (!chunks || !before || chunks.initializers) {
    return 0;
  }
  if (routedChangeId == null || changes.since !== routedChangeId) {
    return 0;
  }
  const places = new Map<
    number,
    { was: ChunkPosition | undefined; now: ChunkPosition | undefined }
  >();
  const placeOf = (id: number) => {
    let place = places.get(id);
    if (!place) {
      place = { was: before.position(id), now: after.position(id) };
      places.set(id, place);
    }
    return place;
  };
  const held = new Map<number, Set<number>>();
  let previous = -1;
  for (let i = 0; i < steps.length; i += 1) {
    const id = chunkOfAddress(steps[i]!.address);
    if (id === previous) {
      continue;
    }
    if (previous >= 0 && held.get(previous)?.has(id)) {
      previous = id;
      continue;
    }
    const place = placeOf(id);
    if (!place.was || !place.now) {
      return i;
    }
    if (previous < 0) {
      if ((place.was.entry === 0) !== (place.now.entry === 0)) {
        return i;
      }
    } else {
      const from = placeOf(previous);
      if (!from.was || !from.now || !sameMove(from.was, place.was, from.now, place.now)) {
        return i;
      }
    }
    if (
      place.was.entry === 0 &&
      sceneStart(before, place.was.sequence) !== sceneStart(after, place.now.sequence)
    ) {
      return i;
    }
    if (previous >= 0) {
      let to = held.get(previous);
      if (!to) {
        to = new Set();
        held.set(previous, to);
      }
      to.add(id);
    }
    previous = id;
  }
  return steps.length;
};

export const levelZeroHolds = (
  work: Pick<LevelZeroWork, "chunks" | "moves" | "first" | "ends">,
  before: ProgramRoot,
  after: ProgramRoot,
  changes: ProgramChangeSummary | undefined,
  heldChangeId: number | undefined,
): boolean => {
  const chunks = changes?.chunks;
  if (!chunks || chunks.initializers || chunks.moved.length > 0) {
    return false;
  }
  if (heldChangeId == null || changes.since !== heldChangeId) {
    return false;
  }
  const places = new Map<
    number,
    { was: ChunkPosition | undefined; now: ChunkPosition | undefined }
  >();
  const placeOf = (id: number) => {
    let place = places.get(id);
    if (!place) {
      place = { was: before.position(id), now: after.position(id) };
      places.set(id, place);
    }
    return place;
  };
  for (const id of work.chunks) {
    const place = placeOf(id);
    if (!place.was || !place.now) {
      return false;
    }
    if (
      place.was.entry === 0 &&
      sceneStart(before, place.was.sequence) !== sceneStart(after, place.now.sequence)
    ) {
      return false;
    }
  }
  if (work.first != null) {
    const place = placeOf(work.first);
    if ((place.was!.entry === 0) !== (place.now!.entry === 0)) {
      return false;
    }
  }
  const lastOf = (at: ChunkPosition) =>
    at.entry === at.sequence.arrays.chunks.length - 1;
  for (const end of work.ends) {
    for (let id = end; ; ) {
      const place = placeOf(id);
      if (!place.was || !place.now) {
        return false;
      }
      if (!lastOf(place.was)) {
        break;
      }
      if (!lastOf(place.now)) {
        return false;
      }
      const owner = place.was.sequence.owner;
      if (owner < 0) {
        break;
      }
      id = owner;
    }
  }
  for (const [from, tos] of work.moves) {
    const a = placeOf(from);
    for (const to of tos) {
      const b = placeOf(to);
      if (!sameMove(a.was!, b.was!, a.now!, b.now!)) {
        return false;
      }
    }
  }
  return true;
};

const sceneStart = (root: ProgramRoot, row: SequenceRow): number => {
  if (row.owner >= 0 || row.kind !== SymbolKind.Branch) {
    return -2;
  }
  const scene = root.parentOf(row.flow);
  const sceneRow = scene < 0 ? undefined : root.flow(scene);
  return sceneRow && sceneRow.arrays.chunks.length === 0
    ? root.startOf(scene)
    : -1;
};

const sameMove = (
  a: ChunkPosition,
  b: ChunkPosition,
  a2: ChunkPosition,
  b2: ChunkPosition,
): boolean => {
  const next =
    a.sequence.id === b.sequence.id && b.entry === a.entry + 1;
  const next2 =
    a2.sequence.id === b2.sequence.id && b2.entry === a2.entry + 1;
  if (next !== next2) {
    return false;
  }
  if ((b.entry === 0) !== (b2.entry === 0)) {
    return false;
  }
  const last = a.entry === a.sequence.arrays.chunks.length - 1;
  const last2 = a2.entry === a2.sequence.arrays.chunks.length - 1;
  if (!next && a.sequence.id !== b.sequence.id && last !== last2) {
    return false;
  }
  return true;
};
