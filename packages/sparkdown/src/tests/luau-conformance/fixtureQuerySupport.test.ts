import { describe, expect, test } from "vitest";
import type { TypeId } from "../../compiler/typecheck/Type";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { checkLuau, type LuauCheckSession } from "./typecheckTestHarness";
import { createHash } from "node:crypto";
import { loadOfficialLuau } from "../compiler/officialLuau";
import { loadDefinitionAst } from "../../compiler/typecheck/DefinitionFile";
import { Mode, type SourceModule } from "../../compiler/typecheck/Module";
import { pinnedModuleDependencyOrder } from "./typecheckModuleOrder";
import { traceFixtureRequires } from "./typecheckRequireTrace";
import * as Ast from "../../compiler/typecheck/Ast";
import {
  runAssertions,
  runPortedCase,
  portProblems,
  type PortedCase,
  type Assertion,
} from "./typecheck/portedCases";

describe("faithful fixture and query execution", () => {
  test.each(['game["\\u{feff}A"]', 'game:GetService("\\u{feff}A")'])(
    "BOM-prefixed module names retain their exact dependency: %s",
    async (argument) => {
      const source = `local M=require(${argument})\nreturn M`;
      expect((await loadOfficialLuau("typecheck"))(source).errors).toBe(0);
      const name = "game/" + String.fromCharCode(0xfeff) + "A";
      const result = checkLuau(source, {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        moduleSources: {
          [name]: "local bad:number='bad'\nreturn 1",
          "game/A": "return 'wrong module'",
        },
      });
      expect(result.checked).toBe(true);
      expect({
        type: result.find({ type: "M" }).print(),
        errors: result.diagnostics.map((d) => [d.module, d.code]),
      }).toEqual({ type: "number", errors: [[name, "TypeMismatch"]] });
    },
  );
  // Actual pinned native tracer byte controls preserve repeated/trailing BOM,
  // distinct normalized spellings and non-BMP paths in both resolver branches.
  test.each(
    [
      ["\\u{feff}\\u{feff}A", String.fromCharCode(0xfeff, 0xfeff) + "A"],
      ["A\\u{feff}", "A" + String.fromCharCode(0xfeff)],
      ["é", "é"],
      ["e\\u{301}", "e" + String.fromCharCode(0x301)],
      ["\\u{1f600}", String.fromCodePoint(0x1f600)],
      ["A\\000B", "A" + String.fromCharCode(0) + "B"],
    ].flatMap(([escaped, text]) =>
      [`game["${escaped}"]`, `game:GetService("${escaped}")`].map(
        (argument) => [argument, "game/" + text] as const,
      ),
    ),
  )(
    "valid UTF-8 path bytes select the exact module: %s",
    async (argument, name) => {
      const source = `local M=require(${argument})\nreturn M`;
      expect((await loadOfficialLuau("typecheck"))(source).errors).toBe(0);
      const result = checkLuau(source, {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        moduleSources: {
          [name]: "local bad:number='bad'\nreturn 1",
          "game/A": "return 'wrong module'",
        },
      });
      expect(
        result.find({ type: "M" }).is(result.find({ builtin: "number" })),
      ).toBe(true);
      expect(result.diagnostics.map((d) => [d.module, d.code])).toEqual([
        [name, "TypeMismatch"],
      ]);
    },
  );
  test.each(["\\128", "\\255", "\\xFF", "\\192\\128"])(
    "invalid UTF-8 path bytes remain an explicit boundary: %s",
    (bytes) => {
      expect(() =>
        checkLuau(`local M=require(game["${bytes}"])\nreturn M`, {
          fixture: "BuiltinsFixture",
          module: "game/Main",
        }),
      ).toThrow(/encoded data/);
    },
  );
  test("changing a shared entry invalidates its transitive cached importers", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const options = { fixture: "BuiltinsFixture", session };
    const source = "local A=require(game.A)\nreturn A";
    const first = checkLuau(source, {
      ...options,
      module: "game/Main",
      moduleSources: {
        "game/A": "local B=require(game.B)\nreturn B",
        "game/B": "return 1",
      },
    });
    expect(first.find({ type: "A" }).print()).toBe("number");
    const changed = checkLuau("return 'new'", {
      ...options,
      module: "game/B",
    });
    expect(
      changed.find({ moduleReturn: true, path: [{ result: 0 }] }).print(),
    ).toBe("string");
    const last = checkLuau(source, { ...options, module: "game/Main" });
    expect(last.find({ type: "A" }).print()).toBe("string");
  });
  test.each(["entry", "supplied"])(
    "shared dependency changes refresh interfaces and fresh errors: %s",
    (update) => {
      const session: LuauCheckSession = { modules: new Map() };
      const options = { fixture: "BuiltinsFixture", session };
      const source = "local A=require(game.A)\nreturn A";
      const a =
        "local B=require(game.B)\nexport type T=B.T\nlocal bad:number='a'\nreturn B";
      const first = checkLuau(source, {
        ...options,
        module: "game/Main",
        moduleSources: {
          "game/A": a,
          "game/B": "export type T=number\nreturn 1",
        },
      });
      expect(first.find({ importedAlias: ["A", "T"] }).print()).toBe("number");
      const changed =
        "export type T=string\nlocal bad:number='b'\nreturn 'new'";
      if (update === "entry")
        checkLuau(changed, { ...options, module: "game/B" });
      const last = checkLuau(source, {
        ...options,
        module: "game/Main",
        ...(update === "supplied"
          ? { moduleSources: { "game/B": changed } }
          : {}),
      });
      expect(last.find({ type: "A" }).print()).toBe("string");
      expect(last.find({ importedAlias: ["A", "T"] }).print()).toBe("string");
      expect(last.diagnostics.map((d) => [d.module, d.code])).toEqual(
        update === "entry"
          ? [["game/A", "TypeMismatch"]]
          : [
              ["game/B", "TypeMismatch"],
              ["game/A", "TypeMismatch"],
            ],
      );
      expect(
        checkLuau(source, { ...options, module: "game/Main" }).diagnostics,
      ).toEqual([]);
    },
  );
  test("changed require edges stop invalidating former dependencies", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const options = { fixture: "BuiltinsFixture", session };
    const source = "local A=require(game.A)\nreturn A";
    checkLuau(source, {
      ...options,
      module: "game/Main",
      moduleSources: {
        "game/A": "local B=require(game.B)\nreturn B",
        "game/B": "return 1",
        "game/C": "return 'new'",
      },
    });
    const switched = checkLuau(source, {
      ...options,
      module: "game/Main",
      moduleSources: { "game/A": "local C=require(game.C)\nreturn C" },
    });
    expect(switched.find({ type: "A" }).print()).toBe("string");
    const retainedA = session.modules.get("game/A");
    checkLuau("return false", { ...options, module: "game/B" });
    expect(session.modules.get("game/A") === retainedA).toBe(true);
    expect(
      checkLuau(source, { ...options, module: "game/Main" })
        .find({ type: "A" })
        .print(),
    ).toBe("string");
  });
  test("newly available dependencies refresh cached missing imports", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const options = { fixture: "BuiltinsFixture", session };
    const source = "local A=require(game.A)\nreturn A";
    const first = checkLuau(source, {
      ...options,
      module: "game/Main",
      moduleSources: { "game/A": "local B=require(game.B)\nreturn B" },
    });
    expect(first.diagnostics.some((d) => d.code === "UnknownRequire")).toBe(
      true,
    );
    const last = checkLuau(source, {
      ...options,
      module: "game/Main",
      moduleSources: { "game/B": "return 1" },
    });
    expect(last.find({ type: "A" }).print()).toBe("number");
    expect(last.diagnostics).toEqual([]);
  });
  test("clearModules also drops retained source and dependency state", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const options = {
      fixture: "BuiltinsFixture",
      session,
      module: "game/Main",
    };
    const source = "local A=require(game.A)\nreturn A";
    expect(
      checkLuau(source, {
        ...options,
        moduleSources: { "game/A": "return 1" },
      })
        .find({ type: "A" })
        .print(),
    ).toBe("number");
    const cleared = checkLuau(source, { ...options, clearModules: true });
    expect(
      cleared.find({ type: "A" }).is(cleared.find({ builtin: "error" })),
    ).toBe(true);
    expect(cleared.diagnostics.map((d) => d.code)).toEqual(["UnknownRequire"]);
    expect(session.modules.has("game/A")).toBe(false);
  });
  // Actual pinned Parser + RequireTracer.cpp output, with Fixture.cpp's
  // resolver model, compared with the actual compiled AST. Existing #879 parse
  // diagnostics remain in the checker result; no error-free parse is claimed.
  test.each([
    ["local M=require(game.A)\nreturn M", ["0:8|game/A|game/A"]],
    ["local M=require(pick(game.A))\nreturn M", ["0:8|<absent>|"]],
    ["local M=require(pick(pick(game.A)))\nreturn M", ["0:8|<absent>|"]],
    [
      "local M=require(require(game.A))\nreturn M",
      ["0:8|game/A|", "0:16|game/A|game/A"],
    ],
    ["local M=require((game.A))\nreturn M", ["0:8|game/A|game/A"]],
    [
      "local folder=game\nlocal M=require(folder.A)\nreturn M",
      ["1:8|game/A|game/A"],
    ],
    [
      "local folder=game\nfolder=workspace\nlocal M=require(folder.A)\nreturn M",
      ["2:8|<absent>|"],
    ],
    [
      "local folder=game\nlocal M=require(folder.A)\nfolder=workspace\nreturn M",
      ["1:8|<absent>|"],
    ],
    [
      "local game=workspace\nlocal M=require(game.A)\nreturn M",
      ["1:8|workspace/A|workspace/A"],
    ],
    ["local game={}\nlocal M=require(game.A)\nreturn M", ["1:8|<absent>|"]],
    ["local M=require(other.A)\nreturn M", ["0:8|<absent>|"]],
    ["local M=require(script.Parent.A)\nreturn M", ["0:8|game/A|game/A"]],
    ["local M=require(game.Parent.A)\nreturn M", ["0:8|<absent>|"]],
    ['local M=require(game["A"])\nreturn M', ["0:8|game/A|game/A"]],
    ['local M=require(game["é"])\nreturn M', ["0:8|game/é|game/é"]],
    ['local M=require(game:GetService("A"))\nreturn M', ["0:8|game/A|game/A"]],
    ['local M=require(workspace:GetService("A"))\nreturn M', ["0:8|<absent>|"]],
    ['local M=require(game:Other("A"))\nreturn M', ["0:8|<absent>|"]],
    ["local M=require(game.A)::any\nreturn M", ["0:8|<absent>|<absent>"]],
    ["local M=require(game.A::any)\nreturn M", ["0:8|<absent>|"]],
    ["type T=typeof(require(game.A))", ["0:14|game/A|game/A"]],
    ["local M=require(game.A, game.B)\nreturn M", ["0:8|game/A|game/A"]],
    ["local require=pick\nlocal M=require(game.A)\nreturn M", []],
    [
      "local folder=game\nlocal folder=workspace\nlocal M=require(folder.A)\nreturn M",
      ["2:8|workspace/A|workspace/A"],
    ],
  ] as const)(
    "pinned require expression map for %s",
    async (source, expected) => {
      const native = (await loadOfficialLuau("typecheck"))(source);
      expect(native.errors).toBe(0);
      const session: LuauCheckSession = { modules: new Map() };
      const checked = checkLuau(source, {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        globals: { pick: "(any)->any", other: "any" },
        session,
      });
      expect(checked.checked).toBe(true);
      const parsed = session.modules.get("game/Main")!.sourceModule.root;
      const trace = traceFixtureRequires(parsed, "game/Main");
      const actual: string[] = [];
      Ast.visitAst(parsed, {
        visit(node) {
          if (
            node instanceof Ast.AstExprCall &&
            node.func instanceof Ast.AstExprGlobal &&
            node.func.name === "require" &&
            node.args.length >= 1
          ) {
            const position = node.location.begin;
            actual.push(
              `${position.line}:${position.column}|${trace.expressions.get(node.args[0]!) ?? "<absent>"}|${trace.expressions.get(node) ?? "<absent>"}`,
            );
          }
          return true;
        },
      });
      expect(actual).toEqual(expected);
    },
  );
  test.each(["pick(game.A)", "pick(pick(game.A))"])(
    "computed require argument does not fabricate a dependency: %s",
    (argument) => {
      const result = checkLuau(`local M=require(${argument})\nreturn M`, {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        globals: { pick: "(any)->any" },
        moduleSources: {
          "game/A": "export type T=number\nlocal bad:number='bad'\nreturn 1",
        },
      });
      // #879 remains the natural-source parser boundary; these assertions
      // inspect the actual checker, not a fabricated error-free parse.
      expect(result.checked).toBe(true);
      expect(
        result.find({ type: "M" }).is(result.find({ builtin: "error" })),
      ).toBe(true);
      expect(result.diagnostics.map((d) => d.code)).toEqual(["UnknownRequire"]);
      expect(() => result.find({ importedAlias: ["M", "T"] })).toThrow(
        /no type/,
      );
      expect(result.diagnostics.some((d) => d.module === "game/A")).toBe(false);
    },
  );
  test("direct require keeps real aliases, return types and dependency errors", () => {
    const result = checkLuau("local M=require(game.A)\nreturn M", {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      moduleSources: {
        "game/A": "export type T=number\nlocal bad:number='bad'\nreturn 1",
      },
    });
    expect(result.checked).toBe(true);
    expect(result.find({ type: "M" }).print()).toBe("number");
    expect(result.find({ importedAlias: ["M", "T"] }).print()).toBe("number");
    expect(result.diagnostics.map((d) => [d.module, d.code])).toEqual([
      ["game/A", "TypeMismatch"],
    ]);
  });
  test("nested require preserves argument versus full-call resolution", () => {
    const result = checkLuau("local M=require(require(game.A))\nreturn M", {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      moduleSources: { "game/A": "export type T=number\nreturn 1" },
    });
    // Pinned preorder gives the inner-call argument query game/A while the
    // outer full-call query remains unresolved. This is not call unwrapping.
    expect(
      result.find({ type: "M" }).is(result.find({ builtin: "error" })),
    ).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["UnknownRequire"]);
    expect(result.find({ importedAlias: ["M", "T"] }).print()).toBe("number");
  });
  test("traced dependency errors survive a rejected require argument count", () => {
    const result = checkLuau("local M=require(game.A,game.B)\nreturn M", {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      moduleSources: {
        "game/A": "local bad:number='a'\nreturn 1",
        "game/B": "local bad:number='b'\nreturn 1",
      },
    });
    expect(result.diagnostics.some((d) => d.code === "GenericError")).toBe(
      true,
    );
    expect(
      result.diagnostics
        .filter((d) => d.module === "game/A")
        .map((d) => d.code),
    ).toEqual(["TypeMismatch"]);
    expect(result.diagnostics.some((d) => d.module === "game/B")).toBe(false);
  });
  // Exact pinned Lexer::readNext treats input byte zero as EOF even when
  // Parser::parse receives the full buffer length. Escaped source NUL differs.
  test.each([
    ["declare foo: number" + String.fromCharCode(0) + "declare bar: )", 0],
    ["declare foo: number declare bar: )", 2],
    ['declare foo: "a' + String.fromCharCode(0) + 'b"', 1],
    ["-- comment" + String.fromCharCode(0) + "\ndeclare bar: )", 0],
    ["--[[" + String.fromCharCode(0) + "]]\ndeclare bar: )", 1],
  ] as const)(
    "declaration input NUL matches explicit-length native parse %s",
    (definition, errors) => {
      const result = checkLuau("local x=1", { definitions: [definition] });
      expect(result.setupSyntaxDiagnostics).toHaveLength(errors);
      if (definition.startsWith("declare foo: number") && errors === 0) {
        expect(result.find({ global: "foo" }).print()).toBe("number");
        expect(() => result.find({ global: "bar" })).toThrow(/no type/);
      }
    },
  );
  test.each([true, false])(
    "module-qualified error queries preserve fresh order, retain=%s",
    (retainFullTypeGraphs) => {
      const result = checkLuau(
        '\n        type MixedTable = {[number]: number, x: number}\n        local t: MixedTable = {"fail"}\n    ',
        retainFullTypeGraphs ? {} : { retainFullTypeGraphs: false },
      );
      expect(result.syntaxDiagnostics).toEqual([]);
      expect(result.diagnostics.map((d) => d.code)).toEqual([
        "TypeMismatch",
        "MissingProperties",
      ]);
      const unqualified = result.find({ diagnosticType: [0, "wantedType"] });
      const qualified = result.find({
        module: "MainModule",
        diagnosticType: [0, "wantedType"],
      });
      expect(unqualified.print()).toBe("number");
      expect(qualified.is(unqualified)).toBe(true);
      expect(qualified.is(result.find({ builtin: "number" }))).toBe(true);
    },
  );
  test("qualified cached-module indices keep raw module order without fresh diagnostics", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const source = "local A=require(game.A)\nreturn A";
    const options = {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      session,
    };
    const first = checkLuau(source, {
      ...options,
      moduleSources: {
        "game/A":
          'type MixedTable = {[number]: number, x: number}\nlocal t: MixedTable = {"fail"}\nreturn 1',
      },
    });
    // Actual checker errors are asserted; this is not a claim that #879's
    // require source has become syntax-diagnostic-free.
    expect(first.diagnostics.map((d) => [d.module, d.code])).toEqual([
      ["game/A", "TypeMismatch"],
      ["game/A", "MissingProperties"],
    ]);
    const second = checkLuau(source, options);
    expect(second.diagnostics).toEqual([]);
    expect(
      second
        .find({ module: "game/A", diagnosticType: [0, "wantedType"] })
        .is(second.find({ builtin: "number" })),
    ).toBe(true);
  });
  test.each([["declare x : number", "declare x:  number"]])(
    "prepared declaration branch uses the actual checker for %s",
    async (source, printed) => {
      const { decorateSource } = await import("./typecheckDecoration");
      const parsed = (await loadOfficialLuau("typecheck"))(source);
      expect(parsed.errors).toBe(0);
      const root = loadDefinitionAst({
        version: 1,
        parser: "7d5f73364fdbbaa984fa545071630eba73cfea98",
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        root: parsed.root,
      });
      const unit: SourceModule = {
        name: "PreparedDeclaration",
        humanReadableName: "PreparedDeclaration",
        root,
        hotcomments: [],
        parseErrors: [],
      };
      const checked = new Frontend().checkSourceModule(unit, Mode.Strict);
      expect(checked.errors).toEqual([]);
      expect(decorateSource(source, checked.module, unit)).toBe(printed);
    },
  );
  test.each([
    [
      "type function id(t:any):any return t end",
      " type function id(t:any): any return t end",
    ],
    [
      "export type function id(t:any):any return t end",
      "export type function id(t:any): any return t end",
    ],
  ])(
    "type function decoration preserves actual checker errors for %s",
    (source, printed) => {
      const result = checkLuau(source);
      expect(result.syntaxDiagnostics).toEqual([]);
      // This checks emission of the genuine AST despite the current type-function
      // environment rejecting explicit any. It does not claim error-free checking.
      expect(result.diagnostics.map((d) => [d.code, d.data?.["name"]])).toEqual(
        [
          ["UnknownSymbol", "any"],
          ["UnknownSymbol", "any"],
        ],
      );
      expect(result.decoratedSource()).toBe(printed);
    },
  );
  test.each([
    ["return f<<number>>", "return f<<number>>"],
    ["return f<<number>>(0x10)", "return f<<number>>(16)  "],
    ["type T = (number | string)?", "type T = (number | string)?"],
    ["type T = number? | string", "type T = number? | string"],
    ["type T = number | string?", "type T = number | string?"],
  ])(
    "remaining expression/type branch uses natural source %s",
    (source, printed) => {
      const result = checkLuau(source, { globals: { f: "<T>(T)->T" } });
      expect(result.syntaxDiagnostics).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      expect(result.decoratedSource()).toBe(printed);
    },
  );
  test("prepared qualified reference preserves native positions and checker errors", async () => {
    const { decorateSource } = await import("./typecheckDecoration");
    const source = "type T = Mod . X";
    const parsed = (await loadOfficialLuau("typecheck"))(source);
    expect(parsed.errors).toBe(0);
    const root = loadDefinitionAst({
      version: 1,
      parser: "7d5f73364fdbbaa984fa545071630eba73cfea98",
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      root: parsed.root,
    });
    const unit: SourceModule = {
      name: "PreparedPrefix",
      humanReadableName: "PreparedPrefix",
      root,
      hotcomments: [],
      parseErrors: [],
    };
    const checked = new Frontend().checkSourceModule(unit, Mode.Strict);
    // This source-backed prepared AST tests the prefix printer independently
    // of source grammar support. Missing Mod remains an actual checker error.
    expect(checked.errors).toHaveLength(1);
    expect(checked.errors[0]?.data.kind).toBe("UnknownSymbol");
    expect(decorateSource(source, checked.module, unit)).toBe(
      "type T = Mod.  X",
    );
  });
  test("prepared native AST preserves mixed variadic lists while #876 blocks source parsing", async () => {
    const { decorateSource } = await import("./typecheckDecoration");
    const source = "type T=(number,...string)->(number,...string)";
    // This natural source remains a Sparkdown grammar defect; no parse success
    // or conformance skip is fabricated. Exercise the genuine prepared AST and
    // real checker separately, as the definition setup boundary permits.
    const parse = await loadOfficialLuau("typecheck"),
      parsed = parse(source);
    expect(parsed.errors).toBe(0);
    const root = loadDefinitionAst({
      version: 1,
      parser: "7d5f73364fdbbaa984fa545071630eba73cfea98",
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      root: parsed.root,
    });
    const declaration = root.body[0];
    expect(declaration).toBeInstanceOf(Ast.AstStatTypeAlias);
    const type = (declaration as Ast.AstStatTypeAlias)
      .type as Ast.AstTypeFunction;
    expect(type).toBeInstanceOf(Ast.AstTypeFunction);
    expect(type.argTypes.tailType).toBeInstanceOf(Ast.AstTypePackVariadic);
    const unit: SourceModule = {
      name: "PreparedVariadic",
      humanReadableName: "PreparedVariadic",
      root,
      hotcomments: [],
      parseErrors: [],
    };
    const checked = new Frontend().checkSourceModule(unit, Mode.Strict);
    expect(checked.errors).toEqual([]);
    expect(decorateSource(source, checked.module, unit)).toBe(
      "type T=(number,...string)->(number,...string)",
    );
  });
  // The native probe installs the zero-location singleton AST which pinned
  // TypeAttach::visitLocal rehydrates; the checker infers the actual cell here.
  test.each([
    ['local x="é" :: "é"; return x,0x10', "local x:'é'='é'::'é';return x,16"],
    [
      'local x="😀" :: "😀"; return x,0x10',
      "local x:'😀'='😀'::'😀';return x,16",
    ],
    [
      'local x="\\u{1F600}" :: "😀"; return x,0x10',
      "local x:'😀'='😀'::'😀'; return x,16  ",
    ],
  ])(
    "inferred Unicode decoration keeps byte positions for %s",
    (source, printed) => {
      const result = checkLuau(source);
      expect(result.syntaxDiagnostics).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      expect(result.find({ type: "x" }).kind).toBe("SingletonType");
      expect(result.decoratedSource()).toBe(printed);
    },
  );
  test.each([
    'return "\\128",0x10',
    'return "\\255",0x10',
    'return "\\xFF",0x10',
  ])("invalid UTF-8 output fails without replacement for %s", (source) => {
    const result = checkLuau(source);
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(() => result.decoratedSource()).toThrow(
      /invalid UTF-8 output bytes/,
    );
  });
  test("NUL bytes retain the pinned escape before UTF-8 decoding", () => {
    const result = checkLuau('return "\\000",0x10');
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.decoratedSource()).toBe("return '\\000',16  ");
  });
  test.each([
    ['local x="a\\000b" :: "a\\000b"', "local x:'a'='a\\000b'::'a\\000b'"],
    ['local x="\\000b" :: "\\000b"', "local x:''='\\000b'::'\\000b'"],
    [
      'local x="é\\000b" :: "é\\000b"; return x,0x10',
      "local x:'é'='é\\000b'::'é\\000b';return x,16",
    ],
    [
      'local x="😀\\000b" :: "😀\\000b"; return x,0x10',
      "local x:'😀'='😀\\000b'::'😀\\000b';return x,16",
    ],
    ['local x="a\\x00b" :: "a\\x00b"', "local x:'a'='a\\000b'::'a\\000b'"],
    [
      'local x="a\\000b\\000c" :: "a\\000b\\000c"',
      "local x:'a'='a\\000b\\000c'::'a\\000b\\000c'",
    ],
  ])("inferred singleton rehydration uses strlen for %s", (source, printed) => {
    const result = checkLuau(source);
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.find({ type: "x" }).kind).toBe("SingletonType");
    expect(result.decoratedSource()).toBe(printed);
  });
  test("explicit singleton and expression retain NUL byte lengths", () => {
    const result = checkLuau('local x:"a\\000b"="a\\000b"');
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.decoratedSource()).toBe("local x:'a\\000b'='a\\000b'");
  });
  // Exact pinned AST printer with TypeAttach's AstName property attachment.
  // The native adapter models the attachment; the checker below is real.
  test.each([
    ['local x={["a\\000b"]=1}', "local x:{a:number}={['a\\000b']=1}", "a\0b"],
    ['local x={["\\000b"]=1}', "local x:{:number}={['\\000b']=1}", "\0b"],
    [
      'local x={["é\\000b"]=1}; return x,0x10',
      "local x:{é:number}={['é\\000b']=1};return x,16",
      "é\0b",
    ],
    [
      'local x={["😀\\000b"]=1}; return x,0x10',
      "local x:{😀:number}={['😀\\000b']=1};return x,16",
      "😀\0b",
    ],
    ['local x={["a\\x00b"]=1}', "local x:{a:number}={['a\\000b']=1}", "a\0b"],
  ])("inferred property AstName ends at NUL for %s", (source, printed, key) => {
    const result = checkLuau(source);
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    const table = result.find({ type: "x" });
    expect(table.kind).toBe("TableType");
    const bytes = String.fromCharCode(...new TextEncoder().encode(key));
    expect(result.find({ type: "x", path: [{ property: bytes }] }).kind).toBe(
      "PrimitiveType",
    );
    expect(result.decoratedSource()).toBe(printed);
  });
  // Measured with the AST-only printer from the exact pinned native source.
  // Explicit annotations keep native and checker fixtures directly comparable.
  test.each([
    [
      "assign-list",
      "local x:number,y:number=1,2; x,y=0x10,1e2",
      "local x:number,y:number=1,2; x,y =16, 100",
    ],
    [
      "type-table-empty",
      "type T={ --[[ comment ]] }",
      "type T={                 }",
    ],
    [
      "type-function-group-arg",
      "type T=((number))->number",
      "type T= (number)-> (number)",
    ],
    [
      "type-generic-pack-parameter",
      "type T<A...> = (A...)->A...\ntype U=T<number,string>",
      "type T<A...> = (A...)->A...\ntype U=T<number,string>",
    ],
    ["binary-op-+", "return 0x10  +  1e2", "return 16 +     100"],
    ["binary-op--", "return 0x10  -  1e2", "return 16 -     100"],
    ["binary-op-*", "return 0x10  *  1e2", "return 16 *     100"],
    ["binary-op-/", "return 0x10  /  1e2", "return 16 /     100"],
    ["binary-op-//", "return 0x10  //  1e2", "return 16 //     100"],
    ["binary-op-%", "return 0x10  %  1e2", "return 16 %     100"],
    ["binary-op-^", "return 0x10  ^  1e2", "return 16 ^     100"],
    ["binary-op-..", "return 0x10  ..  1e2", "return 16 ..     100"],
    ["binary-op-~=", "return 0x10  ~=  1e2", "return 16 ~=     100"],
    ["binary-op-==", "return 0x10  ==  1e2", "return 16 ==     100"],
    ["binary-op-<", "return 0x10  <  1e2", "return 16 <     100"],
    ["binary-op-<=", "return 0x10  <=  1e2", "return 16 <=     100"],
    ["binary-op->", "return 0x10  >  1e2", "return 16 >     100"],
    ["binary-op->=", "return 0x10  >=  1e2", "return 16 >=     100"],
    ["binary-op-and", "return 0x10  and  1e2", "return 16 and     100"],
    ["binary-op-or", "return 0x10  or  1e2", "return 16 or     100"],
    [
      "numeric-for-explicit",
      "for i:number=0x10,1e2,0b10 do break end",
      "for i:number=16,  100,2    do break end",
    ],
    [
      "generic-for-explicit",
      "for k:number,v:number in iter() do break end",
      "for k:number,v:number in iter() do break end",
    ],
    [
      "const-local",
      "const x:number=0x10; return x",
      "const x:number=16  ; return x",
    ],
    [
      "function-self",
      "function t:m(x:number):number return x end",
      "function t:m(x:number): number return x end",
    ],
    ["type-array-read", "type T={read number}", "type T={read number}"],
    [
      "type-indexer-read",
      "type T={read [string]:number}",
      "type T={read [string]:number}",
    ],
    [
      "type-table-properties-read",
      "type T={read a:number;write b:number}",
      "type T={     a:number,      b:number}",
    ],
    ["unicode-byte-columns", 'return "é",0x10', "return 'é',16  "],
    ["unicode-nonbmp-columns", 'return "😀",0x10', "return '😀',16  "],
    ["unicode-escape", 'return "\\u{1F600}",0x10', "return '😀',     16  "],
    [
      "unicode-comment",
      "return 0x10 --[=[ 😀 ]=]",
      "return 16                 ",
    ],
    [
      "unicode-type",
      'local x:"😀" = "😀"; return x,0x10',
      "local x:'😀' = '😀'; return x,16  ",
    ],
    ["unicode-assertion", 'return "é" :: "é",0x10', "return 'é' :: 'é',16  "],
    [
      "comment-equals",
      "return 1 --[=[ a ]] still comment ]=]",
      "return 1                             ",
    ],
    [
      "comment-zero",
      "return 1 --[[ a ]=] still comment ]]",
      "return 1                            ",
    ],
    [
      "comment-nested-depth",
      "return 1 --[==[ a ]=] ]] still comment ]==]",
      "return 1                                   ",
    ],
    [
      "comment-multiline",
      "return --[=[ ]]\n still comment ]=]\n 0x10",
      "return\n\n 16  ",
    ],
    [
      "comments-before-after",
      "--[[leading]]\nreturn 0x10 -- tail\n",
      "\nreturn 16\n",
    ],
    ["empty-table", "return { --[=[ ]] ]=]\n}", "return {\n}"],
    ["table-list", "return {0x10;1e2}", "return {16,  100}"],
    ["table-trailing", "return {0x10,}", "return {16   }"],
    ["table-record", "return {a=0x10; b=1e2;}", "return {a=16,   b=100 }"],
    [
      "table-general",
      "return {[0x10] = 1e2; [1e2] = 0x10;}",
      "return {[16] =   100,[ 100] = 16   }",
    ],
    [
      "table-nested",
      "return {{0x10;1e2;};{a={0x10,};};}",
      "return {{16,  100 },{a={16   } } }",
    ],
    [
      "table-multiline",
      "return {\n 0x10;\n 1e2,\n}",
      "return {\n 16,\n 100\n}",
    ],
    [
      "table-string-record",
      'return {a="hello"; b="there";}',
      "return {a='hello', b='there' }",
    ],
    ["return-empty", "return --[=[ ]] ]=]", "return             "],
    ["return-comma", "return 0x10 , 1e2", "return 16,    100"],
    ["group", "return ( 0x10 )", "return ( 16   )"],
    ["group-nested", "return ((0x10))", "return ((16  ))"],
    ["nil-bool", "return nil,true,false", "return nil,true,false"],
    ["unary-not", "return not not 0x10", "return not not 16  "],
    ["unary-minus", "return - -1e2", "return - -100"],
    ["unary-length", "return # {0x10;1e2}", "return # {16,  100}"],
    ["binary-concat", "return 0x10 .. 1e2", "return 16 ..   100"],
    ["binary-sub", "return 0x10- -1e2", "return 16 -  -100"],
    ["binary-groups", "return (0x10)+(-1e2)", "return (16  )+(-100)"],
    ["binary-multiline", "return 0x10\n + 1e2", "return 16+\n   100"],
    ["binary-and", "return 0x10  and  1e2", "return 16 and     100"],
    ["binary-or", "return nil or  1e2", "return nil or  100"],
    ["index-name", "return t . a", "return t . a"],
    ["index-numeric", "return t[0x10]", "return t[16]  "],
    ["call-empty", "return f( )", "return f() "],
    ["call-space", "return math.abs ( 0x10 )", "return math.abs(  16)   "],
    ["call-multi", "return f(0x10, 1e2)", "return f(16,   100)"],
    [
      "call-nested",
      "return math.abs(math.abs(0x10))",
      "return math.abs(math.abs(16))  ",
    ],
    [
      "if-expr",
      "return if true then 0x10 else 1e2",
      "return if true then 16 else   100",
    ],
    [
      "if-expr-spaces",
      "return if  true   then   0x10    else   1e2",
      "return if  true then     16 else        100",
    ],
    [
      "if-expr-elseif",
      "return if false then 0x10 elseif true then 1e2 else 0b10",
      "return if false then 16 elseif   true then 100 else 2   ",
    ],
    [
      "if-expr-nested",
      "return if true then (if false then 0x10 else 1e2) else 0b10",
      "return if true then (if false then 16 else   100)else  2   ",
    ],
    [
      "if-expr-multiline",
      "return if true\n then 0x10\n else 1e2",
      "return if true then\n      16 else\n      100",
    ],
    ["local-explicit", "local x : number = 0x10", "local x:  number = 16  "],
    [
      "local-list",
      "local x:number,y:number=0x10,1e2",
      "local x:number,y:number=16,  100",
    ],
    [
      "local-comment",
      "local --[=[ ]] ]=]\n x:number=0x10",
      "local\n x:number=16  ",
    ],
    ["local-no-value", "local x:number", "local x:number"],
    ["local-semicolon", "local x:number=0x10;", "local x:number=16  ;"],
    ["assign", "local x:number=0x10; x=1e2", "local x:number=16  ; x =100"],
    [
      "assign-spaces",
      "local x:number=0x10; x   =   1e2",
      "local x:number=16  ; x =     100",
    ],
    ["compound", "local x:number=0x10; x+=1e2", "local x:number=16  ; x+=100"],
    [
      "compound-space",
      "local x:number=0x10; x  +=  1e2",
      "local x:number=16  ; x +=   100",
    ],
    [
      "compound-concat",
      'local x:string="a"; x ..= "b"',
      "local x:string='a'; x ..= 'b'",
    ],
    ["while", "while false do break end", "while false do break end"],
    [
      "while-nested",
      "while false do while false do continue end break end",
      "while false do while false do continue end break end",
    ],
    ["repeat", "repeat until true", "repeat until true"],
    [
      "repeat-body",
      "repeat math.abs(0x10) until true",
      "repeat math.abs(16)   until true",
    ],
    [
      "if-stat",
      "if true then math.abs(0x10) end",
      "if true then math.abs(16)   end",
    ],
    [
      "if-stat-else",
      "if true then math.abs(0x10) else math.abs(1e2) end",
      "if true then math.abs(16)   else math.abs(100) end",
    ],
    [
      "if-stat-elseif",
      "if false then math.abs(0x10) elseif true then math.abs(1e2) else math.abs(0b10) end",
      "if false then math.abs(16)   elseif true then math.abs(100) else math.abs(2)    end",
    ],
    ["do-block", "do math.abs(0x10) end", "   math.abs(16)      end"],
    [
      "function-expr",
      "return function(x:number):number return x end",
      "return function(x:number): number return x end",
    ],
    [
      "function-local",
      "local function f(x:number):number return x end",
      "local function f(x:number): number return x end",
    ],
    [
      "function-global",
      "function f(x:number):number return x end",
      "function f(x:number): number return x end",
    ],
    ["function-empty", "return function():() end", "return function(): ()end"],
    [
      "function-vararg",
      "return function(...:number):number return 1 end",
      "return function(...:number): number return 1 end",
    ],
    [
      "function-generic",
      "return function<T>(x:T):T return x end",
      "return function<T>(x:T): T return x end",
    ],
    [
      "function-pack",
      "return function<T...>(...:T...):T... return ... end",
      "return function<T...>(...:T...): T...return ... end",
    ],
    [
      "function-return-pack",
      'return function(): (number,string) return 1,"x" end',
      "return function(): (number,string) return 1,'x' end",
    ],
    ["type-alias", "type T   =    number", "type T =      number"],
    ["type-export", "export   type T = number", "export type   T = number"],
    [
      "type-generic",
      "type T<A=number,B...=()> = (A,B...)->(A,B...)",
      "type T<A=number,B...=()> = (A,B...)->(A,B...)",
    ],
    ["type-group", "type T = ( number )", "type T = ( number )"],
    ["type-optional", "type T = number ?", "type T = number ?"],
    ["type-union", "type T = number | string", "type T = number | string"],
    ["type-nil-union", "type T = nil | number", "type T =       number?"],
    [
      "type-intersection",
      "type T = (()->number) & (()->string)",
      "type T = (()->(number))&(()->(string))",
    ],
    [
      "type-table-record",
      "type T={a:number; b:string;}",
      "type T={a:number, b:string }",
    ],
    ["type-array", "type T={number}", "type T={number}"],
    [
      "type-indexer",
      "type T={a:string,[number]:number}",
      "type T={a:string,[number]:number}",
    ],
    ["type-typeof", "type T=typeof(math.abs)", "type T=typeof(math.abs)"],
    ["type-singletons", 'type T=true | "hello"', "type T=true | 'hello'"],
    [
      "type-function",
      "type T=(x:number,y:string)->(number,string)",
      "type T=(x:number,y:string)->(number,string)",
    ],
    ["type-generic-function", "type T=<A>(A)->A", "type T=<A>(A)->(A)"],
    [
      "type-reference-parameters",
      "type T<A> = A\ntype U=T<number>",
      "type T<A> = A\ntype U=T<number>",
    ],
  ])("pinned AST emission context %s", (_branch, source, printed) => {
    const result = checkLuau(source, {
      globals: {
        math: "{abs:(number)->number}",
        t: "{a:number,m:(any,number)->number,[number]:number}",
        f: "any",
        iter: "any",
      },
    });
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.decoratedSource()).toBe(printed);
  });
  test.each([
    ["return 1 --[=[ a ]] still comment ]=]", "return 1" + " ".repeat(29)],
    ["return 1 --[[ a ]=] still comment ]]", "return 1" + " ".repeat(28)],
    ["return {0x10;1e2}", "return {16,  100}"],
    ["return {0x10,}", "return {16   }"],
    ["return {a=0x10; b=1e2;}", "return {a=16,   b=100 }"],
    ["return if true then 0x10 else 1e2", "return if true then 16 else   100"],
  ])("AST decoration ignores source trivia for %s", (source, printed) => {
    const result = checkLuau(source);
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.decoratedSource()).toBe(printed);
  });
  test.each([
    ["0x10", "16"],
    ["0b1010", "10"],
    ["1_000", "1000"],
    ["1e2", "100"],
    ["01.500", "1.5"],
    [".1", "0.10000000000000001"],
    ["1e-5", "1.0000000000000001e-05"],
    ["1e-4", "0.0001"],
    ["1e17", "1e+17"],
    ["2147483647.0", "2147483647"],
    ["2147483648.0", "2147483648"],
    ["9007199254740993", "9007199254740992"],
    ["5e-324", "4.9406564584124654e-324"],
    ["1e500", "1e500"],
    ["-0.0", "-0"],
    ["-1e2", "-100"],
    ["-0x10", "-16"],
    ["1846707753922048.25", "1846707753922048.2"],
    ["-2012579083280643.25", "-2012579083280643.2"],
    ["27057084435577.3125", "27057084435577.312"],
  ])(
    "decoration prints numeric AST value %s with pinned precision",
    (literal, printed) => {
      const r = checkLuau(`local x=${literal}`);
      expect(r.syntaxDiagnostics).toEqual([]);
      expect(r.diagnostics).toEqual([]);
      expect(r.decoratedSource()).toBe(`local x:number=${printed}`);
    },
  );
  // Exact outputs measured with the AST-only PrettyPrinter at the same pin.
  // Its separators are emitted before advancing to the next expression.
  test.each([
    ["return 0x0000000000000001,1e2", "return 1,                 100"],
    ["return .1, 0b10\n", "return 0.10000000000000001,2\n"],
    ["return -0.0,0x10", "return -0,  16  "],
    ["return {0b10,.1};", "return {2,   0.10000000000000001};"],
    ["return (01.500)", "return (1.5   )"],
    ["return math.abs(0x10)", "return math.abs(16)  "],
    ["return 0x10+1e2", "return 16 + 100"],
    ["return 0x10  +  1e2", "return 16 +     100"],
    ["return 0x10==1e2", "return 16 == 100"],
    ["return 0x10//1e2", "return 16 // 100"],
    ["return 0x10\n+1e2", "return 16+\n 100"],
    ["return -2147483648.0", "return -2147483648  "],
    ["return 1846707753922048.25", "return 1846707753922048.2 "],
    ["return t[0x10]", "return t[16]  "],
    ["return {[0x10]=1e2}", "return {[16] = 100}"],
    ["return {a=0x10,b=1e2}", "return {a=16,  b=100}"],
    // TypeAttach.cpp annotates the loop AstLocal before printing these values.
    ["for i=0x10,1e2 do end", "for i:number=16,100 do end"],
    ["return -0x10+ -1e2", "return -16 +  -100"],
  ])(
    "numeric decoration retains pinned positions for %s",
    (source, printed) => {
      const r = checkLuau(source, {
        globals: { math: "{abs:(number)->number}", t: "{[number]:number}" },
      });
      expect(r.syntaxDiagnostics).toEqual([]);
      expect(r.diagnostics).toEqual([]);
      expect(r.decoratedSource()).toBe(printed);
    },
  );
  test("flattened pack facts preserve chained heads and the actual residual tail", () => {
    const r = checkLuau(
      "function take_two() return 2,2 end\nfunction take_three() return 1,take_two() end",
    );
    const f = r.find({ type: "take_three" });
    expect(f.returns).toMatchObject({
      length: 1,
      tail: true,
      tailKind: "TypePack",
    });
    expect(f.flattenedReturns).toMatchObject({ length: 3, tail: false });
    runAssertions(r, {
      source: "",
      expect: [
        { type: "take_three", flattenedReturns: { length: 3, tail: false } },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ type: "take_three", returns: { length: 3, tail: false } }],
      }),
    ).toThrow();
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [
          { type: "take_three", flattenedReturns: { length: 1, tail: true } },
        ],
      }),
    ).toThrow();
    const v = checkLuau(
      "local function f(a:number,...:string):(number,...string) return a,... end",
    ).find({ type: "f" });
    expect(v.flattenedArguments).toEqual({
      length: 1,
      tail: true,
      tailKind: "VariadicTypePack",
    });
    expect(v.flattenedReturns).toEqual({
      length: 1,
      tail: true,
      tailKind: "VariadicTypePack",
    });
    const m = checkLuau("return 1,2").find({ moduleReturn: true });
    expect(m.flattenedReturns).toEqual({
      length: 2,
      tail: false,
      tailKind: undefined,
    });
    expect(
      portProblems(
        "X.test.cpp",
        [
          {
            name: "a",
            source: "",
            expect: [
              {
                type: "take_three",
                flattenedReturns: { length: 3, tail: false },
              },
            ],
          },
        ],
        {
          pin: "test",
          errorKinds: [],
          files: { "X.test.cpp": [{ name: "a" }] },
        },
      ),
    ).toEqual([]);
  });
  test("decoration rehydrates singleton contents inside compound types", () => {
    const r = checkLuau("local x=foo", { globals: { foo: "'a, b'" } });
    expect(r.diagnostics).toHaveLength(0);
    expect(r.typeOf("x")).toBe('"a, b"');
    expect(r.decoratedSource()).toBe("local x:'a, b'=foo");
    const t = checkLuau("local x=foo", {
      globals: { foo: "{value: 'a, b | c -> d'}" },
    });
    expect(t.diagnostics).toHaveLength(0);
    expect(t.decoratedSource()).toBe("local x:{value:'a, b | c -> d'}=foo");
    expect(
      checkLuau("local x=foo", {
        globals: { foo: "(value:number)->'a, b'" },
      }).decoratedSource(),
    ).toBe("local x:(value:number)->('a, b')=foo");
    expect(
      checkLuau("local x:'a, b'=foo", {
        globals: { foo: "'a, b'" },
      }).decoratedSource(),
    ).toBe("local x:'a, b'=foo");
  });
  test("decoration follows pinned string quote selection and escaping", () => {
    expect(checkLuau('local x="it\'s"').decoratedSource()).toBe(
      'local x:string="it\\\'s"',
    );
    // The root block's final source position remains line1/column2 after the
    // multiline literal is escaped, as PrettyPrinter::visualizeBlock advances.
    expect(
      checkLuau('local x=[["quote", {value},\t\n]]').decoratedSource(),
    ).toBe("local x:string='\\\"quote\\\", \\123value},\\t\\n'\n  ");
    expect(
      checkLuau("local x=foo", {
        globals: { foo: '"it\\\'s"' },
      }).decoratedSource(),
    ).toBe('local x:"it\\\'s"=foo');
  });
  test("shared port steps assert before the next global setup transition", () => {
    runPortedCase(
      "TypeInfer.annotations.test.cpp",
      {
        name: "ordered setup",
        shareFixture: true,
        checks: [
          {
            source: "local x=sentinel",
            globals: { sentinel: "number" },
            expect: [{ global: "sentinel", equals: "number" }],
          },
          {
            source: "local x=sentinel",
            globals: { sentinel: "string" },
            clearModules: true,
            expect: [{ global: "sentinel", equals: "string" }],
          },
        ],
      },
      () => {
        throw new Error("applicable case skipped");
      },
    );
  });
  test("dependency errors retain module names, source order and reachability", () => {
    const r = checkLuau(
      "local Import=require(game.Types)\nlocal x:Import.T='bad'\nreturn x",
      {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        moduleSources: {
          "game/Types":
            "export type T=number\nlocal a:number='s'\nlocal b:string=1\nreturn 1",
          "game/Unused": "local z:number='unused'\nreturn 1",
        },
      },
    );
    expect(r.setupSyntaxDiagnostics).toEqual([]);
    expect(r.find({ importedAlias: ["Import", "T"] }).print()).toBe("number");
    expect(r.diagnostics.map((d) => [d.module, d.line, d.code])).toEqual([
      ["game/Types", 1, "TypeMismatch"],
      ["game/Types", 2, "TypeMismatch"],
      ["game/Main", 1, "TypeMismatch"],
    ]);
    expect(r.find({ diagnosticType: [0, "givenType"] }).print()).toBe("string");
  });
  test("fresh fixture errors preserve checker insertion order before source sorting", () => {
    // Pinned TypeInfer.tables.test.cpp:1867. Fixture::check marks this module
    // dirty; Frontend::check returns raw fresh errors, not cached getCheckResult.
    const result = checkLuau(
      '\n        type MixedTable = {[number]: number, x: number}\n        local t: MixedTable = {"fail"}\n    ',
    );
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      "TypeMismatch",
      "MissingProperties",
    ]);
    expect(result.find({ diagnosticType: [0, "wantedType"] }).print()).toBe(
      "number",
    );
    expect(result.find({ diagnosticType: [0, "givenType"] }).print()).toBe(
      "string",
    );
    expect(result.diagnostics[1]?.data).toMatchObject({
      context: "Missing",
      properties: ["x"],
    });
  });
  test("fresh dependency errors use postorder and preserve missing-module errors", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const source = "local A=require(game.A)\nlocal B=require(game.B)\nreturn A";
    const first = checkLuau(source, {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      session,
      moduleSources: {
        "game/A": "local C=require(game.C)\nlocal a:number='a'\nreturn 1",
        "game/B": "local C=require(game.C)\nlocal b:number='b'\nreturn 1",
        "game/C": "local c:number='c'\nreturn 1",
        "game/Unused": "local unused:number='u'\nreturn 1",
      },
    });
    // The existing require-parser defect #879 is distinct from real prepared
    // module checking here; this does not claim natural-source parse success.
    expect(first.diagnostics.map((d) => [d.module, d.code])).toEqual([
      ["game/C", "TypeMismatch"],
      ["game/A", "TypeMismatch"],
      ["game/B", "TypeMismatch"],
    ]);
    const missing = checkLuau("local X=require(game.Missing)\nreturn X", {
      fixture: "BuiltinsFixture",
      module: "game/Main",
    });
    expect(missing.diagnostics.map((d) => d.code)).toEqual(["UnknownRequire"]);
  });
  test("fresh sibling errors follow the pinned wasm32 DenseHashSet target", () => {
    const result = checkLuau(
      "local A=require(game.A)\nlocal B=require(game.B)\nreturn A",
      {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        moduleSources: {
          "game/A": "local a:number='a'\nreturn 1",
          "game/B": "local b:number='b'\nreturn 1",
        },
      },
    );
    // The require syntax boundary #879 does not hide real module errors.
    expect(result.checked).toBe(true);
    expect(result.diagnostics.map((d) => [d.module, d.code])).toEqual([
      ["game/A", "TypeMismatch"],
      ["game/B", "TypeMismatch"],
    ]);
  });
  // Exact DenseHashSet header compiled with the attested oracle's wasm32
  // libc++ target. These constants are native outputs, not JS helper outputs.
  test.each([
    [[], []],
    [["game/A"], ["game/A"]],
    [
      ["game/A", "game/B"],
      ["game/B", "game/A"],
    ],
    [
      ["game/B", "game/A"],
      ["game/B", "game/A"],
    ],
    [
      ["game/A", "game/B", "game/C"],
      ["game/B", "game/A", "game/C"],
    ],
    [
      ["game/A", "game/B", "game/A"],
      ["game/B", "game/A"],
    ],
    [
      ["game/é", "game/😀", "game/A"],
      ["game/é", "game/😀", "game/A"],
    ],
  ])("pinned module hash iteration %j", (names, expected) => {
    expect(pinnedModuleDependencyOrder(names)).toEqual(expected);
  });
  test.each([
    [12, [4, 2, 7, 9, 1, 5, 10, 8, 11, 6, 3, 0]],
    [13, [4, 10, 7, 2, 9, 11, 1, 5, 8, 12, 6, 3, 0]],
    [
      24,
      [
        16, 4, 10, 7, 2, 9, 11, 19, 22, 1, 5, 17, 15, 23, 8, 12, 13, 14, 18, 6,
        21, 3, 0, 20,
      ],
    ],
    [
      25,
      [
        16, 4, 10, 7, 9, 11, 2, 19, 22, 5, 1, 24, 17, 15, 23, 8, 12, 13, 14, 18,
        21, 6, 3, 0, 20,
      ],
    ],
  ] as const)("pinned module hash growth boundary %i", (count, expected) => {
    const names = Array.from({ length: count }, (_, i) => "game/Module" + i);
    expect(pinnedModuleDependencyOrder(names)).toEqual(
      expected.map((i) => "game/Module" + i),
    );
    // Duplicate insertion at the threshold must not grow/reorder the set.
    expect(pinnedModuleDependencyOrder([...names, names[0]!])).toEqual(
      expected.map((i) => "game/Module" + i),
    );
  });
  test("unchanged cached dependency errors stay out of a fresh shared result", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const source = "local A=require(game.A)\nreturn A";
    const first = checkLuau(source, {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      session,
      moduleSources: { "game/A": "local a:number='a'\nreturn 1" },
    });
    expect(first.diagnostics.map((d) => [d.module, d.code])).toEqual([
      ["game/A", "TypeMismatch"],
    ]);
    const second = checkLuau(source, {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      session,
    });
    expect(second.diagnostics).toEqual([]);
    expect(
      second
        .find({ module: "game/A", diagnosticType: [0, "givenType"] })
        .print(),
    ).toBe("string");
  });
  test("error builtin identity is accepted by port coverage validation", () => {
    const c: PortedCase = {
      name: "a",
      source: "local x=1",
      expect: [{ builtin: "error", equals: "*error-type*" }],
    };
    expect(
      portProblems("X.test.cpp", [c], {
        pin: "test",
        errorKinds: [],
        files: { "X.test.cpp": [{ name: "a" }] },
      }),
    ).toEqual([]);
  });
  test("recursive function result queries do not eagerly expand their cycle", () => {
    const r = checkLuau("local function f() return f end");
    const f = r.find({ type: "f" });
    expect(f.kind).toBe("FunctionType");
    expect(f.results?.[0]?.is(f)).toBe(true);
  });
  test("const parser and negation path flags use audited fixed behavior", () => {
    const r = checkLuau("const x=1\nx='s'", {
      flags: { LuauExportValueSyntax: true },
    });
    expect(r.diagnostics[0]?.data).toMatchObject({
      message: "Variable 'x' is constant and may not be reassigned",
    });
    const n = checkLuau("local a:Not<false?>=false", {
      fixture: "NegationFixture",
      flags: {
        LuauNewTypePathErrorMessages: true,
        LuauFixSuperNegationTypePaths: true,
      },
    });
    expect(n.diagnostics[0]?.message).toContain("cannot be `~(false?)`");
    expect(() =>
      checkLuau("export const x=1", { flags: { LuauExportValueSyntax: true } }),
    ).toThrow(/not implemented.*LuauExportValueSyntax/);
    expect(() =>
      checkLuau("local a=1", {
        flags: { LuauFixSuperNegationTypePaths: false },
      }),
    ).toThrow(/not implemented.*LuauFixSuperNegationTypePaths/);
  });
  test("discarded nonpersistent diagnostic graphs are owned by the public arena", () => {
    const source = "local x:{a:number}={a=1}\nlocal y:number=x";
    const frontend = new Frontend();
    const realCheck = frontend.checkSourceModule.bind(frontend);
    let original: TypeId | undefined;
    // Observe the real checker's returned cell before the harness clones it;
    // this wrapper returns the unmodified real result, with no mock outcome.
    frontend.checkSourceModule = (...args) => {
      const result = realCheck(...args);
      const error = result.module.errors.find(
        (e) => e.data.kind === "TypeMismatch",
      );
      if (error?.data.kind === "TypeMismatch") original = error.data.givenType;
      return result;
    };
    const session: LuauCheckSession = {
      frontend,
      fixture: "Fixture",
      modules: new Map(),
    };
    const r = checkLuau(source, { session, retainFullTypeGraphs: false });
    const module = session.modules.get("MainModule")!.module;
    const error = module.errors.find((e) => e.data.kind === "TypeMismatch")!;
    if (error.data.kind !== "TypeMismatch") throw new Error("missing mismatch");
    expect(original !== undefined).toBe(true);
    expect(original?.persistent).toBe(false);
    expect(error.data.givenType !== original).toBe(true);
    expect(error.data.givenType.persistent).toBe(false);
    expect(error.data.givenType.owningArena === module.interfaceTypes).toBe(
      true,
    );
    expect(module.interfaceTypes.types).toContain(error.data.givenType);
    expect(module.internalTypes.types).toHaveLength(0);
    expect(r.diagnostics[0]?.data?.["givenType"]).toBe("{ a: number }");
    expect(r.find({ diagnosticType: [0, "givenType"] }).print()).toBe(
      "{ a: number }",
    );
  });
  test("positive control: the ordinary checker executes", () => {
    expect(checkLuau("local x = 1").typeOf("x")).toBe("number");
  });
  test("module return pack paths preserve text versus identity", () => {
    const r = checkLuau(
      "export type Record = { x: number }\nlocal a: Record = {x=1}\nreturn {a=a}, 's'",
    );
    runAssertions(r, {
      source: "",
      expect: [
        {
          moduleReturn: true,
          path: [{ result: 0 }, { property: "a" }],
          printedSameAs: { alias: "Record" },
          options: { exhaustive: true },
        },
        { moduleReturn: true, path: [{ result: 1 }], equals: "string" },
      ],
    });
    expect(() => r.find({ moduleReturn: true, path: [{ result: 3 }] })).toThrow(
      /no type/,
    );
  });
  test("packs report exact head length and explicit tails", () => {
    const r = checkLuau(
      "local function f(a:number,...:string): (number,string) return a,'x' end",
    );
    expect(r.find({ type: "f" }).arguments).toEqual({
      length: 1,
      tail: true,
      tailKind: "VariadicTypePack",
    });
    runAssertions(r, {
      source: "",
      expect: [
        {
          type: "f",
          arguments: { length: 1, tail: true, tailKind: "VariadicTypePack" },
          returns: { length: 2, tail: false },
        },
      ],
    });
  });
  test("definitions and typed globals are installed and isolated", () => {
    const r = checkLuau("local x=foo(1,2)", {
      globals: { foo: "(...number) -> number" },
    });
    expect(r.typeOf("x")).toBe("number");
    expect(r.diagnostics).toHaveLength(0);
    const first = checkLuau("local x=foo", {
      definitions: ["declare foo: string"],
    });
    const second = checkLuau("local x=foo", {
      definitions: ["declare foo: number"],
    });
    expect(first.typeOf("x")).toBe("string");
    expect(second.typeOf("x")).toBe("number");
    expect(
      checkLuau("local x=foo").diagnostics.some(
        (d) => d.code === "UnknownSymbol",
      ),
    ).toBe(true);
  });
  test("named modules resolve imports and changes without cache leakage", () => {
    const source =
      "local Import=require(script.Parent.Types)\nlocal x:Import.T=1\nreturn x";
    const opts = {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      moduleSources: { "game/Types": "export type T=number\nreturn 1" },
    };
    const r = checkLuau(source, opts);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.find({ importedAlias: ["Import", "T"] }).print()).toBe("number");
    runAssertions(r, {
      source: "",
      expect: [
        {
          scopes: {
            count: 1,
            importedModules: [
              { scope: 0, name: "Import", module: "game/Types" },
            ],
          },
        },
      ],
    });
    expect(r.find({ typeAt: [1, 17], module: "game/Types" })).toBeDefined();
    const changed = checkLuau(
      "local Import=require(game.Types)\nlocal x:Import.T='a'",
      {
        ...opts,
        moduleSources: { "game/Types": "export type T=string\nreturn 'a'" },
      },
    );
    expect(changed.typeOf("x")).toBe("string");
  });
  test("subtyping uses the real checker in both directions", () => {
    const r = checkLuau("local a:number=1\nlocal b:number|string='x'");
    expect(r.find({ type: "a" }).subtypeOf(r.find({ type: "b" }))).toBe(true);
    expect(r.find({ type: "b" }).subtypeOf(r.find({ type: "a" }))).toBe(false);
  });
  test("extern inheritance and members execute in the real fixture", () => {
    const r = checkLuau(
      "local c=ChildClass.New()\nlocal b:number=c.BaseField\nlocal s:string=c:Method()",
      { fixture: "ExternTypeFixture" },
    );
    expect(r.checked).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.typeOf("c")).toBe("ChildClass");
  });
  test("refinement extern fixture binds IsA's discriminant", () => {
    const r = checkLuau(
      "local function f(x:Instance)\nif x:IsA('Part') then\nlocal y=x.Position\nend\nend",
      { fixture: "RefinementExternTypeFixture" },
    );
    expect(r.checked).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.find({ typeAt: [2, 10] }).print()).toBe("Vector3");
  });
  test("normalization and inequality inspect actual selected types", () => {
    const r = checkLuau("local x:string?=nil");
    expect(r.find({ type: "x", normalized: true }).print()).toBe("string?");
    runAssertions(r, {
      source: "",
      expect: [{ type: "x", notEquals: "never" }],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ type: "x", notEquals: "string?" }],
      }),
    ).toThrow();
  });
  test("unknown and conflicting flag requests are explicit failures", () => {
    expect(() =>
      checkLuau("local x=1", { flags: { MadeUpFlag: true } }),
    ).toThrow(/not implemented.*MadeUpFlag/);
    expect(() =>
      checkLuau("local x=1", { flags: { DebugLuauForceOldSolver: true } }),
    ).toThrow(/not implemented.*DebugLuauForceOldSolver/);
  });
  test("decorates real inferred function and local annotations", () => {
    const r = checkLuau("local a = 1\nlocal function f(x:number) return x end");
    expect(r.decoratedSource()).toBe(
      "local a:number=1\nlocal function f(x:number): number return x end",
    );
    expect(
      checkLuau(
        "local function f(...:number) return ... end",
      ).decoratedSource(),
    ).toBe("local function f(...:number): ...number return...end");
  });
  test("upstream generic declarations expose kind, polarity and identity", () => {
    const r = checkLuau("local function f<T>(x:T):T return x end");
    runAssertions(r, {
      source: "",
      expect: [
        { type: "f", generics: 1, genericPacks: 0 },
        {
          type: "f",
          path: [{ generic: 0 }],
          kind: "GenericType",
          polarity: "Mixed",
        },
        {
          type: "f",
          path: [{ argument: 0 }],
          sameAs: { type: "f", path: [{ generic: 0 }] },
        },
      ],
    });
    expect(() =>
      runAssertions(r, { source: "", expect: [{ type: "f", generics: 0 }] }),
    ).toThrow();
  });
  test("table instantiation arguments differ from alias declarations", () => {
    const r = checkLuau(
      "type Packed<T,U...>={f:(T,U...)->(T,U...)}\nlocal a:Packed<number>\nlocal b:Packed<string,number,boolean>",
    );
    runAssertions(r, {
      source: "",
      expect: [
        { alias: "Packed", typeParameters: 1 },
        {
          type: "b",
          instantiatedTypeParameters: 1,
          instantiatedTypePackParameters: 1,
        },
        {
          type: "b",
          path: [{ instantiatedTypeParameter: 0 }],
          sameAs: { builtin: "string" },
        },
        {
          type: "b",
          path: [{ instantiatedTypePackParameter: 0 }],
          equals: "number, boolean",
        },
      ],
    });
    expect(() =>
      r.find({ type: "a", path: [{ instantiatedTypeParameter: 1 }] }),
    ).toThrow(/no type/);
  });
  test("hasSelf and resolved overload are inspected rather than inferred from text", () => {
    const r = checkLuau(
      "local t={}\nfunction t:method(x:number) return x end\nlocal f=((nil::any)::((number)->number)&((string)->string))\nlocal n=f(1)",
    );
    expect(r.find({ type: "t", path: [{ property: "method" }] }).hasSelf).toBe(
      true,
    );
    expect(r.find({ overloadAt: [3, 9] }).print()).toBe("(number) -> number");
    expect(r.find({ typeAt: [3, 8] }).kind).toBe("IntersectionType");
  });
  test("diagnostic substrings, end line, field printing and identity are actual queries", () => {
    const r = checkLuau(
      "type V={x:number,y:number}\nlocal x:V={x=1,y=2}\nlocal y:number=x",
    );
    runAssertions(r, {
      source: "",
      expect: [
        {
          error: 0,
          endLine: 2,
          messageContains: "number",
          messageExcludes: "VALUELESS",
          moduleMatchesCheck: true,
          fields: { givenType: "{ x: number, y: number }" },
          fieldOptions: { givenType: { exhaustive: true } },
        },
        { diagnosticType: [0, "wantedType"], sameAs: { builtin: "number" } },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ error: 0, messageExcludes: "number" }],
      }),
    ).toThrow();
    expect(() => r.find({ diagnosticType: [0, "missing"] })).toThrow(/no type/);
    expect(r.find({ builtin: "error" }).print()).toBe("*error-type*");
  });
  test("hidden aliases augment the named fixture only for their check", () => {
    const r = checkLuau("local x:fun=print", {
      fixture: "BuiltinsFixture",
      hiddenTypes: true,
    });
    expect(r.diagnostics).toHaveLength(0);
    expect(r.find({ alias: "fun" }).is(r.find({ builtin: "function" }))).toBe(
      true,
    );
    expect(
      checkLuau("local x:fun=print", {
        fixture: "BuiltinsFixture",
      }).diagnostics.some((d) => d.code === "UnknownSymbol"),
    ).toBe(true);
  });
  test("graph discard retains cloned diagnostics and public interface", () => {
    const r = checkLuau("local x:number='s'\nreturn 1", {
      retainFullTypeGraphs: false,
    });
    expect(r.diagnostics[0]?.data).toMatchObject({
      wantedType: "number",
      givenType: "string",
    });
    expect(r.find({ moduleReturn: true, path: [{ result: 0 }] }).print()).toBe(
      "number",
    );
    expect(() => r.find({ type: "x" })).toThrow(/discarded internal graphs/);
    expect(() => r.decoratedSource()).toThrow(/discarded/);
  });
  test("explicit shared fixture clears module caches while retaining bindings", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const a = checkLuau("local x=sentinel", {
      session,
      fixture: "BuiltinsFixture",
      globals: { sentinel: "number" },
    });
    expect(a.typeOf("x")).toBe("number");
    const b = checkLuau("local y=sentinel", {
      session,
      fixture: "BuiltinsFixture",
      clearModules: true,
    });
    expect(b.typeOf("y")).toBe("number");
    expect(
      checkLuau("local y=sentinel", {
        fixture: "BuiltinsFixture",
      }).diagnostics.some((d) => d.code === "UnknownSymbol"),
    ).toBe(true);
    const original = checkLuau("local original=string.len", {
      session,
      fixture: "BuiltinsFixture",
    }).find({ type: "original" });
    checkLuau("function string.len():number return 1 end", {
      session,
      fixture: "BuiltinsFixture",
    });
    const after = checkLuau(
      "local after=string.len\nlocal n=string.len('hello')",
      { session, fixture: "BuiltinsFixture", clearModules: true },
    );
    expect(after.diagnostics).toHaveLength(0);
    expect(after.find({ type: "after" }).is(original)).toBe(true);
    expect(after.typeOf("n")).toBe("number");
  });
  test("every setup source receives its own parse diagnostics", () => {
    const r = checkLuau("local x=1", {
      moduleSources: { "game/Bad": "local x = )" },
      definitions: ["declare foo: )"],
    });
    expect(r.setupSyntaxDiagnostics?.map((d) => d.module)).toEqual(
      expect.arrayContaining(["game/Bad", "@definitions/0"]),
    );
    expect(() =>
      runPortedCase(
        "TypeInfer.annotations.test.cpp",
        {
          name: "probe",
          source: "local x=1",
          moduleSources: { "game/Bad": "local x = )" },
          expect: [],
        },
        () => {},
      ),
    ).toThrow(/setup source/);
    expect(() =>
      checkLuau("local x=1", {
        module: "MainModule",
        moduleSources: { MainModule: "return 1" },
      }),
    ).toThrow(/duplicated/);
  });
  test("metadata assertions retain property, alias and scope source locations", () => {
    const r = checkLuau("export type T = {x:number}\nlocal t:T={x=1}");
    runAssertions(r, {
      source: "",
      expect: [
        { exportedAlias: "T", definitionLocation: [0, 0, 0, 26] },
        {
          alias: "T",
          hasProperty: ["x"],
          propertyLocations: {
            x: { location: null, typeLocation: [0, 17, 0, 18] },
          },
        },
        {
          scopes: {
            minimum: 1,
            aliases: [{ scope: 0, name: "T", location: [0, 12, 0, 13] }],
          },
        },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ alias: "T", hasProperty: ["missing"] }],
      }),
    ).toThrow();
  });
  test("expected types select the contextual map rather than actual types", () => {
    const r = checkLuau("local f: (number)->number = function(x) return x end");
    expect(r.find({ expectedTypeAt: [0, 30] }).print()).toBe(
      "(number) -> number",
    );
    expect(() => r.find({ expectedTypeAt: [0, 45] })).toThrow(/no type/);
  });
  test("identity inequality, nested scopes and previous locations remain distinct", () => {
    const r = checkLuau(
      "local a={x=1}\nlocal b={x=2}\ndo\ntype T=string\nend\ntype U=number\ntype U=string",
    );
    runAssertions(r, {
      source: "",
      expect: [
        {
          type: "a",
          notSameAs: { type: "b" },
          printedSameAs: { type: "b" },
          options: { exhaustive: true },
        },
        {
          scopes: {
            aliases: [
              { scopeAt: [2, 0], name: "T", location: [3, 5, 3, 6] },
              { scopeAt: [100, 0], name: "U", location: [6, 5, 6, 6] },
            ],
          },
        },
        {
          error: 0,
          code: "DuplicateTypeDefinition",
          fieldLocations: { previousLocation: { present: true, line: 5 } },
        },
        { everyError: { messageExcludes: "VALUELESS" } },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ type: "a", notSameAs: { type: "a" } }],
      }),
    ).toThrow();
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ everyError: { messageExcludes: "U" } }],
      }),
    ).toThrow();
  });
  test("new malformed vocabulary is rejected by coverage validation", () => {
    const manifest = {
      pin: "test",
      errorKinds: ["TypeMismatch"],
      files: { "X.test.cpp": [{ name: "a" }] },
    };
    const malformed: unknown[] = [
      { type: "x", arguments: { length: -1 } },
      { type: "x", returns: { tail: 1 } },
      { type: "x", flattenedArguments: { length: -1 } },
      { type: "x", flattenedReturns: { tailKind: "ImaginaryPack" } },
      { type: "x", hasSelf: 1 },
      { type: "x", path: [{ generic: -1 }] },
      { importedAlias: ["a"] },
      { type: "x", normalized: false },
      { overloadAt: [-1, 0] },
      { type: "x", notSameAs: { type: "y", equals: "ignored" } },
      { type: "x", notEquals: 1 },
      { type: "x", options: { maxTableLength: -1 }, equals: "" },
      { error: 0, messageContains: 1 },
      { error: 0, fieldOptions: { givenType: { exhaustive: true } } },
      { type: "x", propertyLocations: { x: { madeUp: [0, 0, 0, 0] } } },
      {
        scopes: {
          minimum: 0,
          aliases: [{ name: "T", location: [0, 0, 0, 1] }],
        },
      },
    ];
    for (const expectation of malformed) {
      const c = {
        name: "a",
        source: "",
        expect: [expectation],
      } as unknown as PortedCase;
      expect(
        portProblems("X.test.cpp", [c], manifest).length,
        JSON.stringify(expectation),
      ).toBeGreaterThan(0);
    }
    const invalid = [
      { definitions: [1] },
      { globals: { "bad-name": "number" } },
      { moduleSources: { "": 1 } },
      { hiddenTypes: false },
      { retainFullTypeGraphs: true },
      { clearModules: true },
      { flags: { Flag: 1 } },
    ];
    for (const setup of invalid)
      expect(
        portProblems(
          "X.test.cpp",
          [
            {
              name: "a",
              source: "",
              expect: [],
              ...setup,
            } as unknown as PortedCase,
          ],
          manifest,
        ).length,
      ).toBeGreaterThan(0);
    const assertions: Assertion[] = [
      { type: "x", arguments: { length: 1, tail: false } },
      { type: "x", notEquals: "never" },
      {
        type: "x",
        printedSameAs: { type: "y" },
        options: { exhaustive: true },
      },
      {
        error: 0,
        fields: { givenType: "number" },
        fieldOptions: { givenType: { exhaustive: true } },
      },
    ];
    expect(
      portProblems(
        "X.test.cpp",
        [{ name: "a", source: "", expect: assertions }],
        manifest,
      ),
    ).toEqual([]);
  });
});
