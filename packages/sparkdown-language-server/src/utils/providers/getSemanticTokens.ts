import { RangeCursor } from "@codemirror/state";
import { SemanticInfo } from "@impower/sparkdown/src/compiler/classes/annotators/SemanticAnnotator";
import { SparkdownAnnotation } from "@impower/sparkdown/src/compiler/classes/SparkdownAnnotation";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  SemanticTokenModifiers,
  SemanticTokens,
  SemanticTokenTypes,
} from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";

export const TOKEN_TYPES = [...Object.values(SemanticTokenTypes)];
export const TOKEN_MODIFIERS = [...Object.values(SemanticTokenModifiers)];

export const getSemanticTokens = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  range?: Range,
): SemanticTokens => {
  if (!document || !annotations) {
    return { data: [] };
  }
  const tokens: [number, number, number, number, number][] = [];
  const encode = (
    line: number,
    startChar: number,
    length: number,
    tokenType: string,
    tokenModifiers: string[] = [],
  ): [number, number, number, number, number] => {
    const semanticTokenTypes: string[] = TOKEN_TYPES;
    const semanticTokenModifiers: string[] = TOKEN_MODIFIERS;
    return [
      line,
      startChar,
      length,
      semanticTokenTypes.indexOf(tokenType),
      tokenModifiers
        .map((m) => semanticTokenModifiers.indexOf(m))
        .filter((i) => i >= 0)
        .map((i) => 1 << i)
        .reduce((a, b) => a | b, 0),
    ];
  };
  const add = (cur: RangeCursor<SparkdownAnnotation<SemanticInfo>>) => {
    if (!cur.value) return;
    const tokenType = cur.value.type.tokenType;
    if (tokenType === undefined) return;
    const start = document.positionAt(cur.from);
    const length = cur.to - cur.from;
    tokens.push(
      encode(
        start.line,
        start.character,
        length,
        tokenType,
        cur.value.type.tokenModifiers,
      ),
    );
  };
  const iterateFrom = range ? document.offsetAt(range.start) : undefined;
  const iterateTo = range ? document.offsetAt(range.end) : document.length;
  const cur = annotations?.semantics.iter(iterateFrom);
  while (cur?.value) {
    if (cur.from > iterateTo) {
      break;
    }
    const text = document.read(cur.from, cur.to);
    if (cur.value.type.possibleDivertPath) {
      const pathPart1 = text.split(".").slice(0, 1).join(".");
      const pathPart2 = text.split(".").slice(0, 2).join(".");
      const resolvesToBeat =
        !!program?.sceneLocations?.[text] ||
        !!program?.sceneLocations?.[pathPart1] ||
        !!program?.sceneLocations?.[pathPart2] ||
        !!program?.branchLocations?.[text] ||
        !!program?.branchLocations?.[pathPart1] ||
        !!program?.branchLocations?.[pathPart2] ||
        !!program?.labelLocations?.[text] ||
        !!program?.labelLocations?.[pathPart1] ||
        !!program?.labelLocations?.[pathPart2];
      const resolvesToFunction =
        !!program?.functionLocations?.[text] ||
        !!program?.functionLocations?.[pathPart1] ||
        !!program?.functionLocations?.[pathPart2];
      if (resolvesToBeat || resolvesToFunction) {
        const resolvedType: string = resolvesToBeat ? "class" : "function";
        const start = document.positionAt(cur.from);
        tokens.push(
          encode(
            start.line,
            start.character,
            cur.to - cur.from,
            resolvedType,
            cur.value.type.tokenModifiers,
          ),
        );
      }
    } else {
      add(cur);
    }
    cur.next();
  }
  const data: number[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const curr = tokens[i]!;
    const prev = tokens[i - 1];
    if (prev) {
      if (prev[0] === curr[0]) {
        curr[1] -= prev[1];
      }
      curr[0] -= prev[0];
    }
    data.unshift(...curr);
  }
  const result = {
    data,
  };
  return result;
};
