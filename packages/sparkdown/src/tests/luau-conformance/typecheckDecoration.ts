// Luau's attachTypeData/prettyPrintWithTypes convention: inferred annotations
// advance the output column; original tokens retain source lines/columns where
// those columns have not already been consumed by inserted type text.
import {
  AstExprConstantString,
  AstExprFunction,
  AstStatLocalFunction,
  AstLocal,
  visitAst,
} from "../../compiler/typecheck/Ast";
import type { Module, SourceModule } from "../../compiler/typecheck/Module";
import { toString, toStringPack } from "../../compiler/typecheck/ToString";
import {
  flatten,
  follow,
  get,
  type TypeId,
} from "../../compiler/typecheck/Type";

export function decorateSource(
  source: string,
  module: Module,
  ast: SourceModule,
): string {
  const lines = source.split("\n"),
    starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const at = (position: { line: number; column: number }) =>
    (starts[position.line] ?? source.length) + position.column;
  const insertions = new Map<number, string>(),
    strings = new Map<number, { end: number; text: string }>();
  const compact = (text: string) =>
    text.replace(/\s*([,:{}()<>|&])\s*/g, "$1").replace(/\s*->\s*/g, "->");
  const bindings = new Map<AstLocal, TypeId>();
  for (const [, scope] of module.scopes)
    for (const [symbol, binding] of scope.bindings)
      if (symbol instanceof AstLocal) bindings.set(symbol, binding.typeId);
  for (const [local, type] of bindings)
    if (!local.annotation)
      insertions.set(at(local.location.end), `:${compact(toString(type))}`);
  visitAst(ast.root, {
    visit: (node) => {
      if (node instanceof AstStatLocalFunction)
        insertions.delete(at(node.name.location.end));
      if (node instanceof AstExprConstantString) {
        strings.set(at(node.location.begin), {
          end: at(node.location.end),
          text:
            "'" +
            node.value
              .replace(/\\/g, "\\\\")
              .replace(/'/g, "\\'")
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r") +
            "'",
        });
      }
      if (
        node instanceof AstExprFunction &&
        !node.returnAnnotation &&
        node.argLocation
      ) {
        const type = module.astTypes.get(node),
          fn = type ? get(follow(type), "FunctionType") : undefined;
        if (!fn) throw new Error("no inferred function type for decoration");
        const pack = flatten(fn.retTypes),
          printed = compact(toStringPack(fn.retTypes));
        const ret =
          pack.head.length === 1 && !pack.tail ? printed : `(${printed})`;
        insertions.set(at(node.argLocation.end), `: ${ret}`);
      }
      return true;
    },
  });
  let output = "",
    line = 0,
    column = 0,
    last = "";
  const emit = (text: string) => {
    output += text;
    const pieces = text.split("\n");
    if (pieces.length > 1) {
      line += pieces.length - 1;
      column = pieces[pieces.length - 1]!.length;
    } else column += text.length;
    last = text;
  };
  const advance = (position: number) => {
    let targetLine = 0;
    while (
      targetLine + 1 < starts.length &&
      starts[targetLine + 1]! <= position
    )
      targetLine++;
    while (line < targetLine) emit("\n");
    const targetColumn = position - starts[targetLine]!;
    if (column < targetColumn) emit(" ".repeat(targetColumn - column));
  };
  // This is printing, not parsing: the already checked AST supplies strings
  // and annotations. Unsupported literal tokens fail instead of guessing.
  const token =
    /\s+|--\[=*\[[\s\S]*?\]=*\]|--[^\n]*|(?:[A-Za-z_][A-Za-z_0-9]*|(?:0[xX][a-fA-F0-9]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\.\.\.|\.\.|::|->|==|~=|<=|>=|\/\/|[+\-*\/%^#=<>~&|?:,;.(){}\[\]])/gy;
  let cursor = 0;
  while (cursor < source.length) {
    const string = strings.get(cursor);
    let text: string, end: number;
    if (string) {
      text = string.text;
      end = string.end;
    } else {
      token.lastIndex = cursor;
      const match = token.exec(source);
      if (!match)
        throw new Error(`unsupported source decoration token at ${cursor}`);
      text = match[0];
      end = token.lastIndex;
      if (/^\s|^--/.test(text)) {
        cursor = end;
        continue;
      }
    }
    advance(cursor);
    if (/[A-Za-z_0-9]$/.test(last) && /^[A-Za-z_0-9]/.test(text)) emit(" ");
    emit(text);
    cursor = end;
    const inserted = insertions.get(cursor);
    if (inserted) emit(inserted);
  }
  advance(source.length);
  return output;
}
