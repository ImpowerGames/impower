// Incremental type checking (#599). The checker caches each unit's result (a
// `.sd` file's prelude, and each scene or branch) and reuses it when the unit
// and what it can see are unchanged; a change to a prelude name's type (a
// signature) or to a prelude type alias checks every flow again. These tests
// edit a document between compiles and prove that each warm check gives the
// same warnings and types as a cold check of the same text, and that it
// reuses what it should.

import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { TYPE_ERROR_KINDS } from "../../compiler/typecheck/Error";
import type { LuauUnitCheck } from "../../compiler/typecheck/LuauDocumentChecker";
import type { SparkdownTypechecker } from "../../compiler/typecheck/SparkdownTypechecker";
import { toString } from "../../compiler/typecheck/ToString";

const URI = "inmemory:///main.sd";

const BASE = `---
typecheck: strict
---

local count: number = 0

function greet(name: string): string
  return "Hi " .. name
end

scene alpha
  & count = count + 1
  local label: string = greet("Alpha")
  Alpha looks around.
end

scene beta
  local total: number = count + 1
  local line: string = greet("Beta")
  Beta looks around.
end
`;

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  return compiler;
}

function typechecker(compiler: SparkdownCompiler): SparkdownTypechecker {
  return (compiler as unknown as { _typechecker: SparkdownTypechecker })._typechecker;
}

/** A unit's types: every binding in every scope of its module, printed. */
function unitTypes(check: LuauUnitCheck): string[] {
  const out: string[] = [];
  for (const [location, scope] of check.module.scopes) {
    for (const [symbol, binding] of scope.bindings) {
      const name = typeof symbol === "string" ? symbol : symbol.name;
      out.push(`${check.unit.kind} ${location.begin.line}:${location.begin.column} ${name}: ${toString(binding.typeId)}`);
    }
  }
  return out;
}

/** What a compile says about the document's types: its type warnings and every binding's type. */
function snapshot(compiler: SparkdownCompiler) {
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const warnings = (program.diagnostics?.[URI] ?? [])
    .filter((d) => TYPE_ERROR_KINDS.has(String(d.code)))
    .map((d) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${d.code}: ${message}`;
    });
  const types = typechecker(compiler).checksOf(URI).flatMap(unitTypes);
  return { warnings, types };
}

function position(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

/** A document compiled once, then edited and compiled again after each edit. */
class Session {
  readonly compiler: SparkdownCompiler;
  private version = 1;

  constructor(public text: string) {
    this.compiler = newCompiler(text);
    snapshot(this.compiler);
  }

  /** Replaces the first `find` with `replace` and returns the warm check with a cold check of the new text. */
  edit(find: string, replace: string) {
    const offset = this.text.indexOf(find);
    if (offset < 0) throw new Error(`not found: ${find}`);
    const range = { start: position(this.text, offset), end: position(this.text, offset + find.length) };
    this.text = this.text.slice(0, offset) + replace + this.text.slice(offset + find.length);
    this.version += 1;
    this.compiler.updateDocument({ textDocument: { uri: URI, version: this.version }, contentChanges: [{ range, text: replace }] });
    const warm = snapshot(this.compiler);
    const stats = { ...this.compiler.typecheckStats };
    const cold = snapshot(newCompiler(this.text));
    return { warm, cold, stats };
  }
}

describe("incremental type checking", () => {
  test("an edit inside one scope checks that scope again and reuses the rest", () => {
    const session = new Session(BASE);
    const { warm, cold, stats } = session.edit("local total: number = count + 1", "local total: string = count + 1");
    expect(warm).toEqual(cold);
    expect(warm.warnings).toEqual(["17:24-17:33 TypeMismatch: Expected this to be 'string', but got 'number'"]);
    expect(stats).toEqual({ checked: 1, reused: 2 });

    const back = session.edit("local total: string = count + 1", "local total: number = count + 1");
    expect(back.warm).toEqual(back.cold);
    expect(back.warm.warnings).toEqual([]);
  });

  test("an edit outside the Luau reuses every scope", () => {
    const session = new Session(BASE);
    const { warm, cold, stats } = session.edit("Alpha looks around.", "Alpha looks around, then leaves.\n  Beta waves.");
    expect(warm).toEqual(cold);
    expect(stats).toEqual({ checked: 0, reused: 3 });
  });

  test("adding and removing a declaration", () => {
    const session = new Session(BASE);
    // In the prelude: the name is new to every flow, so each is checked again.
    let step = session.edit("local count: number = 0\n", "local count: number = 0\nlocal bonus: string = 1\n");
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual(["5:22-5:23 TypeMismatch: Expected this to be 'string', but got 'number'"]);
    expect(step.stats).toEqual({ checked: 3, reused: 0 });
    step = session.edit("local bonus: string = 1\n", "");
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual([]);

    // In a scene: only that scene is checked again.
    step = session.edit('  local label: string = greet("Alpha")\n', '  local label: string = greet("Alpha")\n  local extra: boolean = label\n');
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual(["13:25-13:30 TypeMismatch: Expected this to be 'boolean', but got 'string'"]);
    expect(step.stats).toEqual({ checked: 1, reused: 2 });
    step = session.edit("  local extra: boolean = label\n", "");
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual([]);
  });

  test("changing a function's signature checks its callers again", () => {
    const session = new Session(BASE);
    const { warm, cold, stats } = session.edit("function greet(name: string): string", "function greet(name: number): string");
    expect(warm).toEqual(cold);
    expect(warm.warnings).toEqual([
      "12:30-12:37 TypeMismatch: Expected this to be 'number', but got 'string'",
      "18:29-18:35 TypeMismatch: Expected this to be 'number', but got 'string'",
    ]);
    expect(stats).toEqual({ checked: 3, reused: 0 });

    // A body edit that leaves the signature alone reuses the callers.
    const body = session.edit('  return "Hi " .. name', '  return "Hello " .. tostring(name)');
    expect(body.warm).toEqual(body.cold);
    expect(body.stats).toEqual({ checked: 1, reused: 2 });
  });

  test("changing a type alias checks the flows that use it again", () => {
    const session = new Session("---\ntypecheck: strict\n---\n\ntype Score = number\n\nscene alpha\n  local score: Score = 1\nend\n");
    const { warm, cold, stats } = session.edit("type Score = number", "type Score = string");
    expect(warm).toEqual(cold);
    expect(warm.warnings).toEqual(["7:23-7:24 TypeMismatch: Expected this to be 'string', but got 'number'"]);
    expect(stats).toEqual({ checked: 2, reused: 0 });
  });

  test("changing only a type alias parameter's default checks the flows that use it again", () => {
    const session = new Session("---\ntypecheck: strict\n---\n\ntype Box<T = number> = T\n\nscene alpha\n  local value: Box = 1\nend\n");
    const { warm, cold, stats } = session.edit("T = number", "T = string");
    expect(warm).toEqual(cold);
    expect(warm.warnings).toEqual(["7:21-7:22 TypeMismatch: Expected this to be 'string', but got 'number'"]);
    expect(stats).toEqual({ checked: 2, reused: 0 });
  });

  test("changing the end of a type alias default longer than a message prints checks the flows that use it again", () => {
    // Forty fields print to more than the 500 characters Luau's messages stop at.
    const fields = Array.from({ length: 40 }, (_, i) => `f${String(i).padStart(2, "0")}: number`).join(", ");
    const session = new Session(
      `---\ntypecheck: strict\n---\n\ntype Box<T = { ${fields}, z: number }> = T\n\nscene alpha\n  local item: Box = {} :: any\n  local value: number = item.z\nend\n`,
    );
    const { warm, cold, stats } = session.edit("z: number", "z: string");
    expect(warm).toEqual(cold);
    expect(warm.warnings).toEqual(["8:24-8:30 TypeMismatch: Expected this to be 'number', but got 'string'"]);
    expect(stats).toEqual({ checked: 2, reused: 0 });
  });
});
