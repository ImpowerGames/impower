import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import {
  SemanticTokenModifiers,
  SemanticTokens,
  SemanticTokenTypes,
} from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";

export const getSemanticTokens = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  range?: Range
): SemanticTokens => {
  if (!document || !annotations) {
    return { data: [] };
  }
  const timeStarted = performance.now();
  const tokens: [number, number, number, number, number][] = [];
  const encode = (
    line: number,
    startChar: number,
    length: number,
    tokenType: string,
    tokenModifiers: string[]
  ): [number, number, number, number, number] => {
    const semanticTokenTypes: string[] = Object.values(SemanticTokenTypes);
    const semanticTokenModifiers: string[] = Object.values(
      SemanticTokenModifiers
    );
    return [
      line,
      startChar,
      length,
      semanticTokenTypes.indexOf(tokenType),
      tokenModifiers
        .map((m) => semanticTokenModifiers.indexOf(m))
        .reduce((a, b) => a | b, 0),
    ];
  };
  const add = (
    line: number,
    startChar: number,
    length: number,
    tokenType: string,
    tokenModifiers: string[] = []
  ) => {
    tokens.push(encode(line, startChar, length, tokenType, tokenModifiers));
  };
  const iterateFrom = range ? document.offsetAt(range.start) : undefined;
  const iterateTo = range ? document.offsetAt(range.end) : document.length;
  const cur = annotations?.semantics.iter(iterateFrom);
  while (cur?.value) {
    if (cur.from > iterateTo) {
      break;
    }
    const start = document.positionAt(cur.from);
    const length = cur.to - cur.from;
    if (cur.value.type.tokenType === "struct") {
      const type = document.read(cur.from, cur.to);
      // Only highlight the node as a struct type if the struct type name actually exists
      if (program?.context?.[type]) {
        add(
          start.line,
          start.character,
          length,
          cur.value.type.tokenType,
          cur.value.type.tokenModifiers
        );
      }
    }
    cur.next();
  }
  // See LSP Spec for semantic tokens for information on the encoding process:
  // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens
  const data: number[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const curr = tokens[i]!;
    const prev = tokens[i - 1];
    if (prev) {
      // on the same line
      if (prev[0] === curr[0]) {
        // startChar is relative startChar of prev token
        curr[1] -= prev[1];
      }
      // line is relative to line of prev token
      curr[0] -= prev[0];
    }
    data.unshift(...curr);
  }
  const result = {
    data,
  };
  return result;
};
