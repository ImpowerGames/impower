import { expect } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { isDefineMethodCall } from "../../compiler/utils/defineMethodCall";
import { parseSource } from "./grammarSnapshot";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

export function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

export function errorsOf(compiler: SparkdownCompiler): string[] {
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error)
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

export const errors = (text: string) => errorsOf(newCompiler(text));

function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

const PADDING = "function padding()\n  local p = 0\nend\n";

export function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "    "],
  ] as const) {
    const compiler = newCompiler(padded);
    compiler.compile({ textDocument: { uri: URI } } as never);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + removed) }, text: insert }],
    } as never);
    const edited = padded.slice(0, offset) + insert + padded.slice(offset + removed);
    expect(errorsOf(compiler), `after ${JSON.stringify(insert)}`).toEqual(errorsOf(newCompiler(edited)));
  }
}

export function methodReadings(text: string): string[] {
  const readings: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do {
    if (cursor.name !== "LuauMethodDefinition") continue;
    const node: SyntaxNode = cursor.node;
    const name = node.getChild("LuauMethodDefinition_begin");
    const header = text.slice(name?.from ?? node.from, name?.to ?? node.from).trim();
    readings.push(`${header}:${isDefineMethodCall(node, (pos) => text.slice(0, pos).split("\n").length - 1) ? "call" : "method"}`);
  } while (cursor.next());
  return readings;
}
