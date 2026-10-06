import {
  createSceneAssetCapture,
  type SceneAssetCapture,
  type SceneBeat,
} from "../compiler/types/SceneAssets";
import { scanAssetDirectives } from "../compiler/utils/scanAssetDirectives";
import { CALL_TUNNEL, Op, flagsOf, opOf } from "./ProgramInstructions";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import { SymbolKind } from "./ProgramSymbols";
import {
  HEADER_WORDS,
  addressOf,
  blockCount,
  chunkId,
  codeWords,
  type StatementChunk,
} from "./StatementChunk";

/** Adds what `from` names to `into`, a record of the same beat, each name
 *  once and in the order the beat names them. */
const mergeBeat = (into: SceneBeat, from: SceneBeat): void => {
  for (const key of ["image", "audio", "layouts", "loads"] as const) {
    const names = from[key];
    if (!names) {
      continue;
    }
    const merged = [...(into[key] ?? [])];
    for (const name of names) {
      if (!merged.includes(name)) {
        merged.push(name);
      }
    }
    into[key] = merged;
  }
};

/**
 * What each top-level flow of a program of statement chunks references, as
 * `program.sceneAssets` is built from it (`SparkdownCompiler.populateSceneAssets`):
 * the asset directives each beat writes, under the address of the beat's
 * `LineStart`, and the flows the flow's jumps, tunnels and calls leave for.
 * The current engine's program gathers the same from the walk of its runtime
 * tree that fills its path locations; a program of chunks has no such walk.
 *
 * A top-level flow is the top-level content (`"0"`), a scene with its
 * branches, or a function, and each one's statements are read in the order
 * the root keeps them, each block statement before the statements of its
 * bodies.
 */
export const captureProgramAssets = (
  root: ProgramRoot,
): Map<string, SceneAssetCapture> => {
  const captures = new Map<string, SceneAssetCapture>();
  const strings = root.table.strings;
  const symbols = root.table.symbols;
  // The top-level flow a symbol's name stands in: its first segment, or the
  // top-level content's.
  const flowOfName = (name: string | undefined): string | undefined => {
    if (name === undefined) {
      return undefined;
    }
    const head = name.split(".")[0] ?? "";
    return head === "" ? "0" : head;
  };
  const visitChunk = (chunk: StatementChunk, capture: SceneAssetCapture) => {
    const id = chunkId(chunk);
    const words = codeWords(chunk);
    let beat = -1;
    for (let offset = 0; offset < words; offset += 2) {
      const word0 = chunk[HEADER_WORDS + offset]!;
      const arg = chunk[HEADER_WORDS + offset + 1]!;
      switch (opOf(word0)) {
        case Op.LineStart:
          beat = offset;
          break;
        case Op.Str:
        case Op.Text: {
          const text = strings[arg];
          if (text && (text.includes("[[") || text.includes("(("))) {
            const address = addressOf(id, beat >= 0 ? beat : offset);
            const before = capture.beats.at(-1);
            const scanned = scanAssetDirectives(text, address, capture);
            // The texts of one beat that an interpolation splits name one
            // beat's assets, under its one address (round 1 of the review
            // of #1618).
            if (scanned && before?.address === address) {
              capture.beats.pop();
              mergeBeat(before, scanned);
            }
          }
          break;
        }
        case Op.JumpSym: {
          const target = flowOfName(symbols[arg]);
          if (target) {
            capture.edges.push({ target, call: false });
          }
          break;
        }
        case Op.Call: {
          const target = flowOfName(symbols[arg]);
          if (target) {
            capture.edges.push({
              target,
              call: !(flagsOf(word0) & CALL_TUNNEL),
            });
          }
          break;
        }
        case Op.CallVar: {
          // A call through the variable that holds a function names the
          // function; a tunnel through a variable goes where only the
          // running story knows.
          const variable = strings[arg] ?? "";
          if (flagsOf(word0) & CALL_TUNNEL) {
            capture.dynamic = true;
          } else if (variable && !variable.startsWith("$")) {
            capture.edges.push({ target: variable, call: true });
          }
          break;
        }
        case Op.JumpVar:
          capture.dynamic = true;
          break;
      }
    }
  };
  const visitSequence = (row: SequenceRow, capture: SceneAssetCapture) => {
    for (const chunk of row.arrays.chunks) {
      visitChunk(chunk, capture);
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = root.body(chunk, k);
        if (body) {
          visitSequence(body, capture);
        }
      }
    }
  };
  // Every flow, a branch under its scene, each script's flows in line order.
  const uris = new Set<string>();
  for (const row of root.flowSequences()) {
    uris.add(row.uri);
  }
  for (const uri of uris) {
    for (const row of root.flows(uri)) {
      let symbol = row.flow;
      if (row.kind === SymbolKind.Branch) {
        const scene = root.parentOf(symbol);
        if (scene >= 0) {
          symbol = scene;
        }
      }
      const name = flowOfName(symbols[symbol]) ?? "0";
      let capture = captures.get(name);
      if (!capture) {
        capture = createSceneAssetCapture();
        captures.set(name, capture);
      }
      visitSequence(row, capture);
    }
  }
  if (!captures.has("0")) {
    captures.set("0", createSceneAssetCapture());
  }
  return captures;
};
