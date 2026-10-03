// Incremental type checking (#599). The checker caches each unit's result (a
// `.sd` file's prelude, and each scene or branch) and reuses it when the unit
// and what it can see are unchanged; a prelude edit rechecks its flows when
// exported graph equivalence cannot be proved. These tests
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
import { equivalentExports } from "../../compiler/typecheck/EquivalentExports";
import { Location } from "../../compiler/typecheck/Location";
import { Scope } from "../../compiler/typecheck/Scope";
import { functionType, genericType, genericTypePack, PrimitiveKind, Property, Props, tableType, TableIndexer, TableState, Type, TypeFun, TypePackVar } from "../../compiler/typecheck/Type";

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

/** Independent graph observations, beyond diagnostic printing's names/limits.
 * Allocation counters, arenas and solver scope objects belong to a check's
 * execution, so normalize those while retaining type edges/sharing and all
 * other variant/alias/property metadata. This is test evidence, never a key.
 */
function unitGraphs(check: LuauUnitCheck): unknown {
  const ids = new Map<Type | TypePackVar, number>();
  const cells: unknown[] = [];
  const observe = (value: unknown): unknown => {
    if (value instanceof Type || value instanceof TypePackVar) {
      const prior = ids.get(value);
      if (prior !== undefined) return { ref: prior };
      const id = cells.length;
      ids.set(value, id);
      cells.push(null);
      cells[id] = { persistent: value.persistent, documentation: value instanceof Type ? value.documentationSymbol : undefined, variant: observe(value.ty) };
      return { ref: id };
    }
    if (value instanceof Props) return observe(value.entries());
    if (Array.isArray(value)) return value.map(observe);
    if (typeof value === "function") return String(value);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "scope" && key !== "index")
      .map(([key, item]) => [key, observe(item)]));
    return value;
  };
  const scopes = check.module.scopes.map(([location, scope]) => ({
    location: observe(location),
    bindings: [...scope.bindings].map(([symbol, binding]) => [typeof symbol === "string" ? symbol : symbol.name, observe(binding)]),
    aliases: [...scope.exportedTypeBindings, ...scope.privateTypeBindings].map(([name, alias]) => [name, observe(alias)]),
  }));
  return { scopes, cells };
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
  const graphs = typechecker(compiler).checksOf(URI).map(unitGraphs);
  return { warnings, types, graphs };
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

  test("an edit inside narrative between two Luau statements reuses the scene, whose warnings move with its lines", () => {
    // A unit is read in its own lines (#1286), so the scene's AST is the same
    // however many story lines stand between its statements, and whatever
    // they say, as the text-keyed cache before it guaranteed too.
    const session = new Session(
      BASE.replace("  & count = count + 1\n", "  & count = count + 1\n  Alpha stretches.\n").replace(
        'local label: string = greet("Alpha")',
        'local label: number = greet("Alpha")',
      ),
    );
    const first = session.edit("  Alpha stretches.\n", "  Alpha stretches, then yawns.\n  Somebody knocks.\n");
    expect(first.warm).toEqual(first.cold);
    expect(first.warm.warnings).toEqual(["14:24-14:38 TypeMismatch: Expected this to be 'number', but got 'string'"]);
    expect(first.stats).toEqual({ checked: 0, reused: 3 });

    const back = session.edit("  Alpha stretches, then yawns.\n  Somebody knocks.\n", "  Nobody comes.\n");
    expect(back.warm).toEqual(back.cold);
    expect(back.warm.warnings).toEqual(["13:24-13:38 TypeMismatch: Expected this to be 'number', but got 'string'"]);
    expect(back.stats).toEqual({ checked: 0, reused: 3 });
  });

  test("an edit to a comment in a scene's Luau reuses the scene", () => {
    // A unit's key is read from its tokens (#1286), and a comment other than
    // a `--!` directive is no token, so it changes nothing the check reads.
    const session = new Session(BASE.replace("  & count = count + 1\n", "  & count = count + 1 -- one more visit\n"));
    const { warm, cold, stats } = session.edit("-- one more visit", "-- one more visit to the alpha room");
    expect(warm).toEqual(cold);
    expect(stats).toEqual({ checked: 0, reused: 3 });
  });

  test("lines added after a .luau file's last token move its end-of-input error, as a cold check places it", () => {
    // The end of a `run` file's Luau is where an error at the end is placed,
    // so it is part of the unit's key (#1286).
    const uri = "inmemory:///snippet.luau";
    const errors = (compiler: SparkdownCompiler) =>
      (compiler.compile({ textDocument: { uri } }).program.diagnostics?.[uri] ?? [])
        .filter((d) => d.code === "SyntaxError")
        .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${typeof d.message === "string" ? d.message : d.message.value}`);
    const configure = (text: string) => {
      const compiler = new SparkdownCompiler();
      compiler.configure({ files: [{ uri, type: "script", name: "snippet", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
      return compiler;
    };
    const warm = configure("local x = t.");
    expect(errors(warm)).toEqual(["0:12-0:12 Expected identifier, got <eof>"]);
    warm.updateDocument({
      textDocument: { uri, version: 2 },
      contentChanges: [{ range: { start: { line: 0, character: 12 }, end: { line: 0, character: 12 } }, text: "\n\n" }],
    });
    const after = errors(warm);
    expect(after).toEqual(errors(configure("local x = t.\n\n")));
    expect(after).not.toEqual(["0:12-0:12 Expected identifier, got <eof>"]);
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

    // A body edit checks the prelude again, but leaves the callers' types
    // and messages unchanged, so their results can be reused (#999).
    const body = session.edit('  return "Hi " .. name', '  return "Hello " .. tostring(name)');
    expect(body.warm).toEqual(body.cold);
    expect(body.stats).toEqual({ checked: 1, reused: 2 });
  });

  test("typing inside a function body reuses scenes without hiding a new prelude warning", () => {
    const session = new Session(BASE);
    const step = session.edit('return "Hi " .. name', 'return 42');
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual(["7:9-7:11 TypeMismatch: Expected this to be 'string', but got 'number'"]);
    expect(step.stats).toEqual({ checked: 1, reused: 2 });
    const back = session.edit('return 42', 'return "Hello " .. name');
    expect(back.warm).toEqual(back.cold);
    expect(back.warm.warnings).toEqual([]);
    expect(back.stats).toEqual({ checked: 1, reused: 2 });
  });

  test("swapping a prelude type between two aliases of the same shape checks the flows that use it again", () => {
    const aliases = "---\ntypecheck: strict\n---\n\ntype A = { value: number }\ntype B = { value: number }\n";
    // A prelude value's annotation.
    const value = new Session(`${aliases}local item: A = { value = 1 }\n\nscene alpha\n  local wrong: string = item\nend\n`);
    let step = value.edit("local item: A", "local item: B");
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual(["9:24-9:28 TypeMismatch: Expected this to be 'string', but got 'B'"]);
    expect(step.stats).toEqual({ checked: 2, reused: 0 });
    // An alias parameter's default.
    const defaults = new Session(`${aliases}type Box<T = A> = T\n\nscene alpha\n  local item: Box = { value = 1 }\n  local wrong: string = item\nend\n`);
    step = defaults.edit("T = A", "T = B");
    expect(step.warm).toEqual(step.cold);
    expect(step.warm.warnings).toEqual(["10:24-10:28 TypeMismatch: Expected this to be 'string', but got 'B'"]);
    expect(step.stats).toEqual({ checked: 2, reused: 0 });
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

describe("prelude export equivalence", () => {
  const parent = Scope.root(new TypePackVar({ kind: "TypePack", head: [] }));
  const number = new Type({ kind: "PrimitiveType", type: PrimitiveKind.Number }, true);
  const string = new Type({ kind: "PrimitiveType", type: PrimitiveKind.String }, true);
  function exports() {
    const scope = Scope.child(parent);
    const generic = new Type(genericType({ name: "T" }));
    const pack = new TypePackVar(genericTypePack({ name: "U" }));
    const table = new Type(tableType({ state: TableState.Sealed, props: new Props([["value", Property.rw(generic)]]) }));
    if (table.ty.kind !== "TableType") throw new Error("table");
    table.ty.name = "Box";
    table.ty.instantiatedTypeParams = [generic];
    table.ty.instantiatedTypePackParams = [pack];
    table.ty.indexer = new TableIndexer(string, number);
    const fn = new Type(functionType(new TypePackVar({ kind: "TypePack", head: [generic], tail: pack }),
      new TypePackVar({ kind: "TypePack", head: [table] }), { generics: [generic], genericPacks: [pack] }));
    scope.bindings.set("make", { typeId: fn, location: new Location() });
    scope.privateTypeBindings.set("Box", new TypeFun(table, [{ ty: generic, defaultValue: number }], [{ tp: pack,
      defaultValue: new TypePackVar({ kind: "VariadicTypePack", ty: string, hidden: false }) }]));
    return { scope, table, fn, generic, pack };
  }

  test("compares recursive graphs and generic sharing without allocation indices", () => {
    const a = exports(), b = exports();
    expect(equivalentExports(a.scope, b.scope)).toBe(true);
    if (a.table.ty.kind !== "TableType" || b.table.ty.kind !== "TableType") throw new Error("table");
    a.table.ty.props.set("next", Property.rw(a.table));
    b.table.ty.props.set("next", Property.rw(b.table));
    expect(equivalentExports(a.scope, b.scope)).toBe(true);
    b.table.ty.props.get("value")!.writeTy = new Type(genericType({ name: "T" }));
    expect(equivalentExports(a.scope, b.scope)).toBe(false);
  });

  test.each(["name", "syntheticName", "state", "read", "write", "indexer", "indexerReadOnly", "metatable",
    "default", "packDefault", "generic", "genericPack", "argumentName", "deprecation", "documentation", "tag", "newField"])(
    "invalidates changes to %s even when the usual printed type can stay alike", (change) => {
      const a = exports(), b = exports();
      if (b.table.ty.kind !== "TableType" || b.fn.ty.kind !== "FunctionType" || b.generic.ty.kind !== "GenericType" || b.pack.ty.kind !== "GenericTypePack") throw new Error("fixture");
      const table = b.table.ty;
      switch (change) {
        case "name": table.name = "Other"; break;
        case "syntheticName": table.syntheticName = "Other"; break;
        case "state": table.state = TableState.Unsealed; break;
        case "read": table.props.get("value")!.readTy = string; break;
        case "write": table.props.get("value")!.writeTy = undefined; break;
        case "indexer": table.indexer!.indexResultType = string; break;
        case "indexerReadOnly": table.indexer!.isReadOnly = true; break;
        case "metatable": b.scope.bindings.set("meta", { typeId: new Type({ kind: "MetatableType", table: b.table, metatable: string }), location: new Location() }); break;
        case "default": b.scope.privateTypeBindings.get("Box")!.typeParams[0]!.defaultValue = string; break;
        case "packDefault": b.scope.privateTypeBindings.get("Box")!.typePackParams[0]!.defaultValue = b.pack; break;
        case "generic": b.generic.ty.name = "V"; break;
        case "genericPack": b.pack.ty.name = "V"; break;
        case "argumentName": b.fn.ty.argNames = [{ name: "item", location: new Location() }]; break;
        case "deprecation": table.props.get("value")!.deprecated = true; break;
        case "documentation": b.table.documentationSymbol = "other"; break;
        case "tag": table.tags.push("other"); break;
        case "newField": Object.assign(table, { futureObservableField: true }); break;
      }
      expect(equivalentExports(a.scope, b.scope)).toBe(false);
    });

  test("unresolved and executable cells cannot be proved equivalent by matching shapes", () => {
    const a = exports(), b = exports();
    a.table.ty = { kind: "BlockedType", index: 1, owner: undefined };
    b.table.ty = { kind: "BlockedType", index: 1, owner: undefined };
    expect(equivalentExports(a.scope, b.scope)).toBe(false);
  });
});
