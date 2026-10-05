import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst, type SparkdownAnalysisAst, type SparkdownAnalysisValue } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { AstExprConstantNumber, AstStatBlock, AstStatReturn, AstStatSparkdownChoose, AstStatSparkdownExplicit, AstStatSparkdownStore, AstExprGlobal, AstStatLocal, AstLocal, AstExprLocal, AstStatTypeAlias } from "../../compiler/typecheck/Ast";
import { Location } from "../../compiler/typecheck/Location";
import { readSparkdownStatements } from "../../compiler/typecheck/SparkdownReading";

function units(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [] });
  return sparkdownUnits(compiler.documents.parser.parse(text), text);
}
function array(value: SparkdownAnalysisValue): SparkdownAnalysisValue[] {
  if (!value || typeof value !== "object" || !("tag" in value) || value.tag !== "array") throw new Error("Expected array");
  return value.values;
}
function reference(value: SparkdownAnalysisValue, tag: "node" | "local"): number {
  if (!value || typeof value !== "object" || !("tag" in value) || value.tag !== tag) throw new Error(`Expected ${tag}`);
  return value.id;
}
function roundtrip(ast: SparkdownAnalysisAst): SparkdownAnalysisAst {
  return JSON.parse(JSON.stringify(ast)) as SparkdownAnalysisAst;
}

describe("Sparkdown analysis AST input (encoder only, native decoder separately verified)", () => {
  test("qualified binding metadata distinguishes unavailable, authoritative null and exact local identity", () => {
    const unit = units('local Module = require("dep")\ntype Alias = Module.Alias\n').prelude;
    const declaration = unit.root.body[0] as AstStatLocal, alias = unit.root.body[1] as AstStatTypeAlias;
    const read = () => encodeSparkdownAnalysisAst(unit).nodes.find(n => n.kind === "TypeReference" && n.fields["prefix"] === "Module")!;
    expect(read().fields["prefixLocal"]).toEqual({ tag: "local", id: 0 });
    Object.assign(alias.type, { prefixLocal: undefined });
    expect(read().fields["prefixLocal"]).toEqual({ tag: "absent" });
    Object.assign(alias.type, { prefixLocal: null });
    expect(read().fields["prefixLocal"]).toBeNull();
    // Supplied only as an exact fixture fact; production converter must retain
    // its own lexical binding, including shadow/capture identity.
    Object.assign(alias.type, { prefixLocal: declaration.vars[0] });
    const encoded = encodeSparkdownAnalysisAst(unit);
    const ref = encoded.nodes.find(n => n.kind === "TypeReference" && n.fields["prefix"] === "Module")!;
    const binding = reference(ref.fields["prefixLocal"]!, "local");
    expect(encoded.locals[binding]!["name"]).toBe("Module");
    expect(encoded.nodes.find(n => n.kind === "StatLocal")!.fields["vars"]).toEqual({ tag: "array", values: [{ tag: "local", id: binding }] });
  });
  test("declarations, captures and shadow chains retain distinct local identities after transfer", () => {
    const ast = roundtrip(encodeSparkdownAnalysisAst(units(`local value: number = 1
function outer(arg: number)
  local value: string = "inner"
  local function capture()
    return value, arg
  end
  return capture()
end
`).prelude));
    const values = ast.locals.flatMap((local, id) => local["name"] === "value" ? [id] : []);
    expect(values).toHaveLength(2);
    const [outer, inner] = values;
    expect(reference(ast.locals[inner!]!["shadow"]!, "local")).toBe(outer);
    expect(ast.locals[outer!]!["annotation"]).not.toEqual(ast.locals[inner!]!["annotation"]);
    const captured = ast.nodes.filter((node) => node.kind === "ExprLocal" && node.fields["upvalue"] === true)
      .map((node) => reference(node.fields["local"]!, "local"));
    expect(captured).toContain(inner);
    expect(captured.some((id) => ast.locals[id]!["name"] === "arg")).toBe(true);
    expect(captured).not.toContain(outer);
    const declarations = ast.nodes.filter((node) => node.kind === "StatLocal")
      .flatMap((node) => array(node.fields["vars"]!).map((local) => reference(local, "local")));
    expect(declarations).toEqual(values);
  });

  test("narrative insertion relocates the unit map without changing its transferred AST", () => {
    const before = `scene first(n: number)
  local wrong: string = n
  Story one.
  local copy: number = n
end
`;
    const a = units(before).flows[0]!;
    const b = units(before.replace("  Story one.\n", "  Story two.\n  More story.\n")).flows[0]!;
    expect(b.key).toBe(a.key);
    expect(b.lines).not.toEqual(a.lines);
    expect(roundtrip(encodeSparkdownAnalysisAst(b))).toEqual(roundtrip(encodeSparkdownAnalysisAst(a)));
  });

  test("UTF16 source ranges and Luau literal bytes are independent encodings", () => {
    const source = ['local text = "😀\\000tail"', 'local wrong: number = "é"', ""].join("\r\n");
    const unit = units(source).prelude;
    const ast = roundtrip(encodeSparkdownAnalysisAst(unit));
    expect(ast.positionEncoding).toBe("utf16");
    const strings = ast.nodes.filter((node) => node.kind === "ExprConstantString");
    expect(strings[0]!.fields["value"]).toBe(String.fromCharCode(0xf0, 0x9f, 0x98, 0x80, 0) + "tail");
    expect(strings[0]!.range).toEqual({ begin: [0, 13], end: [0, 25] });
    expect(strings[1]!.fields["value"]).toBe(String.fromCharCode(0xc3, 0xa9));
    expect(strings[1]!.range).toEqual({ begin: [1, 22], end: [1, 25] });
  });

  test("type-function bodies and generic defaults survive independently from ordinary function types", () => {
    const ast = roundtrip(encodeSparkdownAnalysisAst(units(`type function Optional(t)
  return types.optional(t)
end
type Box<T = number> = { value: T }
local result: Optional<number> = nil
`).prelude));
    const declaration = ast.nodes.find((node) => node.kind === "StatTypeFunction")!;
    expect(declaration.fields["name"]).toBe("Optional");
    const body = ast.nodes[reference(declaration.fields["body"]!, "node")]!;
    expect(body.kind).toBe("ExprFunction");
    const parameter = reference(array(body.fields["args"]!)[0]!, "local");
    expect(ast.locals[parameter]!["name"]).toBe("t");
    expect(ast.nodes.some((node) => node.kind === "ExprLocal" && reference(node.fields["local"]!, "local") === parameter)).toBe(true);
    const generic = ast.nodes.find((node) => node.kind === "GenericType")!;
    expect(ast.nodes[reference(generic.fields["defaultValue"]!, "node")]!.fields["name"]).toBe("number");
  });

  test("branch runtime arguments and Sparkdown expressions retain explicit semantic tags", () => {
    const ast = roundtrip(encodeSparkdownAnalysisAst(units(`scene first
  local target = -> first
  local pattern = @/ab+c/i
  branch inner(n: number)
    local line = "Hello {n}"
    local made = new widget(n)
  end
end
`).flows[0]!));
    expect(ast.nodes.some((node) => node.kind === "SparkdownFlowArgument")).toBe(true);
    expect(ast.nodes.some((node) => node.kind === "SparkdownDivertTarget")).toBe(true);
    const interpolated = ast.nodes.find((node) => node.kind === "SparkdownInterpString")!;
    expect(interpolated.fields["luauValue"]).toBe("Hello {n}");
    const made = ast.nodes.find((node) => node.kind === "SparkdownNew")!;
    expect(made.fields["className"]).toBe("widget");
    expect(ast.nodes[reference(array(made.fields["args"]!)[0]!, "node")]!.kind).toBe("ExprLocal");
    expect(JSON.stringify(ast)).not.toContain('"source"');
  });

  test("nonfinite constants and negative zero do not become null or positive zero in JSON", () => {
    const location = new Location();
    const root = new AstStatBlock(location, [new AstStatReturn(location, [NaN, Infinity, -Infinity, -0].map((n) => new AstExprConstantNumber(location, n)))]);
    const ast = roundtrip(encodeSparkdownAnalysisAst({ kind: "prelude", root, errors: [], hotcomments: [], commentLocations: [], lines: [0], key: "fixture" }));
    expect(ast.nodes.filter((node) => node.kind === "ExprConstantNumber").map((node) => node.fields["value"]))
      .toEqual(["nan", "infinity", "-infinity", "-zero"].map((value) => ({ tag: "number", value })));
  });

  test("new node fields fail explicitly before any lossy transfer", () => {
    const unit = units("local x = 1\n").prelude;
    Object.assign(unit.root, { futureObservableField: true });
    expect(() => encodeSparkdownAnalysisAst(unit)).toThrow("Unsupported analysis AST field StatBlock.futureObservableField");
  });

  test("raw statement wrappers transfer the authoritative statements without opening a choice scope or mutating the AST", () => {
    const location = new Location();
    const shared = new AstLocal("shared", location, undefined, 0, 0, undefined);
    const declared = new AstStatLocal(location, [shared], [new AstExprConstantNumber(location, 1)], undefined);
    const store = new AstStatSparkdownStore(location, [new AstExprGlobal(location, "saved")], [undefined], [new AstExprLocal(location, shared, false)], undefined);
    const gather = new AstStatBlock(location, [new AstStatSparkdownExplicit(location, store, location)]);
    const choose = new AstStatSparkdownChoose(location, new AstStatBlock(location, [declared]), gather);
    const returned = new AstStatReturn(location, [new AstExprLocal(location, shared, false)]);
    const root = new AstStatBlock(location, [choose, returned]);
    const unit = { kind: "prelude" as const, root, errors: [], hotcomments: [], commentLocations: [], lines: [0], key: "raw-wrapper" };
    const actual = roundtrip(encodeSparkdownAnalysisAst(unit));
    expect(root.body).toEqual([choose, returned]);
    expect(gather.body[0]).toBeInstanceOf(AstStatSparkdownExplicit);
    const body = array(actual.nodes[actual.root]!.fields["body"]!).map(item => actual.nodes[reference(item, "node")]!);
    expect(body.map(node => node.kind)).toEqual(["StatLocal", "StatAssign", "StatReturn"]);
    const local = reference(array(body[0]!.fields["vars"]!)[0]!, "local");
    const savedValue = actual.nodes[reference(array(body[1]!.fields["values"]!)[0]!, "node")]!;
    const returnValue = actual.nodes[reference(array(body[2]!.fields["list"]!)[0]!, "node")]!;
    expect(reference(savedValue.fields["local"]!, "local")).toBe(local);
    expect(reference(returnValue.fields["local"]!, "local")).toBe(local);
    readSparkdownStatements(root);
    expect(actual).toEqual(roundtrip(encodeSparkdownAnalysisAst(unit)));
  });
});
