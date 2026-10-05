import { describe, expect, it } from "vitest";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { loadDefinitionAst, type DefinitionFile } from "../../compiler/typecheck/DefinitionFile";
import { AstExprLocal, AstStatDeclareGlobal, AstStatLocal, AstTypeTypeof } from "../../compiler/typecheck/Ast";
import { createHash } from "node:crypto";
import builtinDefinitions from "../../compiler/typecheck/definitions/builtin.json";
import { follow, get, primitiveType, PrimitiveKind } from "../../compiler/typecheck/Type";
import checkedAbs from "../compiler/definition-fixtures/checked-abs.json";
import {
  definitionLoadFacts,
  definitionMetadata,
  logicalModuleTypeCount,
} from "./definitionLoadObservations";

// Prepared root from the independently hash-attested 7d5 parser audit of
// TypeInfer.definitions.test.cpp:80's second direct load. The JSON encoder
// repeats the local record in typeof; it does not serialize object identity.
function failedLocalDefinition(): DefinitionFile {
  const source = "\n        local foo: string = 123\n        declare bar: typeof(foo)\n    ";
  const local = {
    type: "AstLocal", name: "foo", location: "1,14 - 1,17", isConst: false,
    luauType: {
      type: "AstTypeReference", location: "1,19 - 1,25", name: "string",
      nameLocation: "1,19 - 1,25", parameters: [], hasParameterList: false,
    },
  };
  return {
    version: 1,
    parser: "7d5f73364fdbbaa984fa545071630eba73cfea98",
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    root: {
      type: "AstStatBlock", location: "0,0 - 3,4", hasEnd: true,
      body: [
        {
          type: "AstStatLocal", location: "1,8 - 1,31", vars: [local],
          values: [{ type: "AstExprConstantNumber", location: "1,28 - 1,31", value: 123 }],
        },
        {
          type: "AstStatDeclareGlobal", location: "2,8 - 2,32", name: "bar", nameLocation: "2,16 - 2,19",
          luauType: {
            type: "AstTypeTypeof", location: "2,21 - 2,32",
            expr: { type: "AstExprLocal", location: "2,28 - 2,31", local: structuredClone(local) },
          },
        },
      ],
    },
  };
}

describe("definition-load observations", () => {
  it("exposes the actual source module on a successful prepared load", () => {
    const frontend = new Frontend();
    const loaded = frontend.loadDefinitionFile(
      frontend.globals, frontend.globals.globalScope, checkedAbs, "@first",
    );
    expect(loaded.success).toBe(true);
    expect(definitionLoadFacts(loaded).sourceModuleName).toBe("@first");
    expect(definitionLoadFacts(loaded).sourceModuleHumanReadableName).toBe("@first");
    expect(loaded.sourceModule?.root === loaded.module?.root).toBe(true);
    expect(definitionLoadFacts(loaded).parseErrors).toEqual([]);
    expect(definitionLoadFacts(loaded).checkedErrors).toEqual([]);
  });

  it("retains the real source module and diagnostic layer after a failed load", () => {
    const frontend = new Frontend();
    // Alter the prepared annotation to name an unknown type. The runtime
    // checker, rather than this test, constructs the diagnostic and rejects it.
    const invalid: DefinitionFile = structuredClone(checkedAbs);
    const root = invalid.root as { body: { params: { types: { name: string }[] } }[] };
    root.body[0]!.params.types[0]!.name = "MissingDefinitionType";
    const loaded = frontend.loadDefinitionFile(
      frontend.globals, frontend.globals.globalScope, invalid, "@invalid",
    );
    expect(loaded.success).toBe(false);
    expect(definitionLoadFacts(loaded).sourceModuleName).toBe("@invalid");
    expect(loaded.sourceModule?.root === loaded.module?.root).toBe(true);
    expect(definitionLoadFacts(loaded).parseErrors).toEqual([]);
    expect(definitionLoadFacts(loaded).checkedErrors.length).toBeGreaterThan(0);
    expect(definitionLoadFacts(loaded).checkedErrors[0]!.code).toBe("UnknownSymbol");
    expect(definitionMetadata(frontend, { binding: "abs" })).toBeUndefined();
  });

  it("does not manufacture missing globals or documentation on builtin types", () => {
    const frontend = new Frontend();
    expect(definitionMetadata(frontend, { binding: "unexpected" })).toBeUndefined();
    const string = definitionMetadata(frontend, { builtin: "string" })!;
    expect(string.print()).toBe("string");
    expect(string.typeDocumentationSymbol).toBeUndefined();
    expect(string.is(definitionMetadata(frontend, { builtin: "string" })!)).toBe(true);
    expect(string.is(definitionMetadata(new Frontend(), { builtin: "string" })!)).toBe(false);
  });

  it("counts the checked module's actual arena nodes", () => {
    const frontend = new Frontend();
    const loaded = frontend.loadDefinitionFile(
      frontend.globals, frontend.globals.globalScope, checkedAbs, "@count",
    );
    expect(loaded.success).toBe(true);
    expect(logicalModuleTypeCount(loaded.module!)).toBe(loaded.module!.internalTypes.types.length);
    expect(logicalModuleTypeCount(loaded.module!)).toBeGreaterThan(0);
    while (loaded.module!.internalTypes.types.length <= 80)
      loaded.module!.internalTypes.addType(primitiveType(PrimitiveKind.Number));
    expect(logicalModuleTypeCount(loaded.module!) <= 80).toBe(false);
  });

  it("reads actual binding, type and property symbols independently", () => {
    const frontend = new Frontend();
    const loaded = frontend.loadDefinitionFile(
      frontend.globals, frontend.globals.globalScope, builtinDefinitions, "@metadata-control",
    );
    expect(loaded.success).toBe(true);
    const binding = frontend.globals.globalScope.linearSearchForBinding("math")!;
    const table = get(follow(binding.typeId), "TableType")!;
    const prop = table.props.get("abs")!;
    // Mutate actual objects solely as a query-honesty control. These strings
    // are deliberately unrelated to upstream's expected documentation names.
    binding.documentationSymbol = "control.binding";
    binding.typeId.documentationSymbol = "control.type";
    prop.documentationSymbol = "control.property";
    const root = definitionMetadata(frontend, { binding: "math" })!;
    const member = definitionMetadata(frontend, { binding: "math", path: [{ property: "abs" }] })!;
    expect(root.bindingDocumentationSymbol).toBe("control.binding");
    expect(root.typeDocumentationSymbol).toBe("control.type");
    expect(root.propertyDocumentationSymbol).toBeUndefined();
    expect(root.propertyCount).toBe(table.props.size);
    expect(member.propertyDocumentationSymbol).toBe("control.property");
    expect(member.typeDocumentationSymbol === "control.type").toBe(false);
    expect(definitionMetadata(frontend, { binding: "math", path: [{ property: "missing" }] })).toBeUndefined();
    prop.documentationSymbol = "changed.property";
    expect(definitionMetadata(frontend, { binding: "math", path: [{ property: "abs" }] })!.propertyDocumentationSymbol).toBe("changed.property");
    expect(member.propertyDocumentationSymbol).toBe("control.property");
  });

  it("preserves function definition locations and return TypeId identity", () => {
    const frontend = new Frontend();
    const loaded = frontend.loadDefinitionFile(
      frontend.globals, frontend.globals.globalScope, checkedAbs, "@function-control",
    );
    expect(loaded.success).toBe(true);
    const fn = definitionMetadata(frontend, { binding: "abs" })!;
    expect(fn.kind).toBe("FunctionType");
    expect(fn.functionDefinition?.definitionModuleName).toBe("@function-control");
    expect(fn.functionDefinition?.definitionLocation).toEqual([0, 9, 1, 0]);
    expect(fn.functionDefinition?.originalNameLocation).toEqual([0, 26, 0, 29]);
    expect(fn.functionDefinition?.varargLocation).toBeUndefined();
    const result = definitionMetadata(frontend, { binding: "abs", path: [{ result: 0 }] })!;
    expect(result.is(definitionMetadata(frontend, { builtin: "number" })!)).toBe(true);
    expect(definitionMetadata(frontend, { binding: "abs", path: [{ result: 1 }] })).toBeUndefined();
    expect(() => definitionMetadata(frontend, { binding: "abs", path: [{ argument: -1 }] })).toThrow("nonnegative integer");
  });

  it("keeps ordered loads in one frontend without leaking into an unrelated case", () => {
    const first = new Frontend();
    first.loadDefinitionFile(first.globals, first.globals.globalScope, checkedAbs, "@before");
    const before = definitionMetadata(first, { binding: "abs" })!;
    first.loadDefinitionFile(first.globals, first.globals.globalScope, checkedAbs, "@after");
    const after = definitionMetadata(first, { binding: "abs" })!;
    expect(before.functionDefinition?.definitionModuleName).toBe("@before");
    expect(after.functionDefinition?.definitionModuleName).toBe("@after");
    expect(after.is(before)).toBe(false);
    expect(definitionMetadata(new Frontend(), { binding: "abs" })).toBeUndefined();
  });

  it("checks the upstream failed local definition without polluting globals", () => {
    const frontend = new Frontend();
    const loaded = frontend.loadDefinitionFile(
      frontend.globals, frontend.globals.globalScope, failedLocalDefinition(), "@test",
    );
    expect(loaded.success).toBe(false);
    expect(definitionLoadFacts(loaded).parseErrors).toEqual([]);
    expect(definitionLoadFacts(loaded).checkedErrors.some((error) => error.code === "TypeMismatch")).toBe(true);
    expect(definitionMetadata(frontend, { binding: "foo" })).toBeUndefined();
    expect(definitionMetadata(frontend, { binding: "bar" })).toBeUndefined();
  });

  it("shares a declared AstLocal with typeof and isolates it across loads", () => {
    const prepared = failedLocalDefinition();
    const root = loadDefinitionAst(prepared);
    const declaration = root.body[0] as AstStatLocal;
    const global = root.body[1] as AstStatDeclareGlobal;
    const reference = (global.type as AstTypeTypeof).expr as AstExprLocal;
    expect(reference.local === declaration.vars[0]).toBe(true);
    expect(reference.upvalue).toBe(false);
    const freshRoot = loadDefinitionAst(prepared);
    expect((freshRoot.body[0] as AstStatLocal).vars[0] === declaration.vars[0]).toBe(false);
  });

  it("rejects unknown local references and unsupported local scopes", () => {
    const unknown = failedLocalDefinition();
    const root = unknown.root as { body: { luauType: { expr: { local: { location: string } } } }[] };
    root.body[1]!.luauType.expr.local.location = "99,0 - 99,3";
    expect(() => loadDefinitionAst(unknown)).toThrow("local reference");
    const nested = failedLocalDefinition();
    nested.root = { type: "AstStatBlock", location: "0,0 - 3,4", hasEnd: true, body: [nested.root] };
    expect(() => loadDefinitionAst(nested)).toThrow("local scope");
    const unsupported = failedLocalDefinition();
    const declarations = unsupported.root as { body: { vars: { isConst: boolean }[] }[] };
    declarations.body[0]!.vars[0]!.isConst = true;
    expect(() => loadDefinitionAst(unsupported)).toThrow("local declaration");
  });
});
