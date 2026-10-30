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
  type ProgramChunk,
} from "./ProgramChunk";

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

export const captureProgramAssets = (
  root: ProgramRoot,
): Map<string, SceneAssetCapture> => {
  const captures = new Map<string, SceneAssetCapture>();
  const strings = root.table.strings;
  const symbols = root.table.symbols;
  const flowOfName = (name: string | undefined): string | undefined => {
    if (name === undefined) {
      return undefined;
    }
    const head = name.split(".")[0] ?? "";
    return head === "" ? "0" : head;
  };
  const visitChunk = (chunk: ProgramChunk, capture: SceneAssetCapture) => {
    const id = chunkId(chunk);
    const words = codeWords(chunk);
    const visited = new Set<number>();
    const visitBody = (k: number) => {
      if (visited.has(k) || k < 0 || k >= blockCount(chunk)) {
        return;
      }
      visited.add(k);
      const body = root.body(chunk, k);
      if (body) {
        visitSequence(body, capture);
      }
    };
    let beat = -1;
    for (let offset = 0; offset < words; offset += 2) {
      const word0 = chunk[HEADER_WORDS + offset]!;
      const arg = chunk[HEADER_WORDS + offset + 1]!;
      switch (opOf(word0)) {
        case Op.LineStart:
          beat = offset;
          break;
        case Op.EnterBlock:
          visitBody(arg);
          break;
        case Op.Str:
        case Op.Text: {
          const text = strings[arg];
          if (text && (text.includes("[[") || text.includes("(("))) {
            const address = addressOf(id, beat >= 0 ? beat : offset);
            const before = capture.beats.at(-1);
            const scanned = scanAssetDirectives(text, address, capture);
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
    for (let k = 0; k < blockCount(chunk); k += 1) {
      visitBody(k);
    }
  };
  const visitSequence = (row: SequenceRow, capture: SceneAssetCapture) => {
    for (const chunk of row.arrays.chunks) {
      visitChunk(chunk, capture);
    }
  };
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
  const scripts = new Map<string, number>();
  for (const capture of captures.values()) {
    const keys = new Map<SceneBeat, [number, number, number]>();
    for (const beat of capture.beats) {
      const at = root.locationOf(beat.address);
      if (at && !scripts.has(at.uri)) {
        scripts.set(at.uri, scripts.size);
      }
      keys.set(
        beat,
        at
          ? [scripts.get(at.uri)!, at.startLine, at.startColumn]
          : [Number.MAX_SAFE_INTEGER, 0, 0],
      );
    }
    capture.beats.sort((a, b) => {
      const ka = keys.get(a)!;
      const kb = keys.get(b)!;
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
    });
  }
  if (!captures.has("0")) {
    captures.set("0", createSceneAssetCapture());
  }
  return captures;
};
