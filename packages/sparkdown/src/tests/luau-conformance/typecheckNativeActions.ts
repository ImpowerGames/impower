import { expect } from "vitest";
import type { NativeFixture, TypeHandle, CaptureHandle, NativeDiagnostic, NativeLocation } from "../analysis-backend/native-conformance/nativeFixture";
import { nonStrictDefinitions } from "../analysis-backend/native-conformance/fixtureSources";
import type { LocationTuple } from "./typecheckTestHarness";

export interface DefinitionTypeAssertion {
  rawKind?: "extern" | "function" | "table";
  documentation?: string | null;
  definitionModuleName?: string | null;
  sameAsBuiltin?: "number" | "string" | "any";
  properties?: Record<string, { count: 0 | 1; documentation?: string | null; readable?: boolean; read?: DefinitionTypeAssertion }>;
  definition?: { module: string | null; location: LocationTuple; originalName: LocationTuple; varargPresent: boolean };
}
export type DefinitionAssertion =
  | { success: boolean }
  | { parseErrors: number }
  | { definitionErrors: number }
  | { modulePresent: boolean }
  | { sourceModuleName: string; sourceHumanReadableName?: string }
  | { parseError: number; message?: string; location?: LocationTuple }
  | { definitionError: number; kind?: string; message?: string; location?: LocationTuple }
  | { binding: { name: string; present: boolean; documentation?: string | null; type?: DefinitionTypeAssertion } }
  | { alias: { name: string; present: boolean; type?: DefinitionTypeAssertion } };
export interface NativeDefinitionResult {
  success: boolean;
  parseErrors: (NativeLocation & {message:string})[];
  // Direct definition results are not CheckResult and have no invented index.
  diagnostics: Omit<NativeDiagnostic,"nativeIndex">[];
  modulePresent: boolean;
  sourceModuleName: string;
  sourceHumanReadableName: string;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function keys(value: unknown, allowed: readonly string[], required: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !(key in value)))
    throw Error("Invalid native definition action/assertion shape");
}
const natural = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

export type MismatchBuiltin = "string" | "number" | "boolean";
export interface TypeMismatchDataAssertion { wanted: MismatchBuiltin; given: MismatchBuiltin }
export interface CaptureGlobalFunction { as: string; global: string; property: string }
export interface ExpectCapturedLevels { capture: string; levelUnchanged: true; subLevelUnchanged: true }
export interface CheckThrows { source: string; exception: "InternalCompilerError" }
export type ModuleDiagnosticsAssertion = { module: string; errors: number } | { module: string; moduleIndex: number; kind: string };

function supportKeys(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== names.length || names.some(name => !(name in value)))
    throw Error("Invalid native support action/assertion shape");
}
const name = (value: unknown, maximum = 256) => typeof value === "string" && value.length > 0 && value.length <= maximum && !value.includes("\0");
export function validateCaptureGlobalFunction(value: unknown): asserts value is CaptureGlobalFunction {
  supportKeys(value,["as","global","property"]);
  if (!name(value["as"],64) || !name(value["global"]) || !name(value["property"])) throw Error("Invalid native capture names");
}
export function validateCapturedLevels(value: unknown): asserts value is ExpectCapturedLevels {
  supportKeys(value,["capture","levelUnchanged","subLevelUnchanged"]);
  if (!name(value["capture"],64) || value["levelUnchanged"] !== true || value["subLevelUnchanged"] !== true)
    throw Error("Invalid native captured level assertions");
}
export function validateCheckThrows(value: unknown): asserts value is CheckThrows {
  supportKeys(value,["source","exception"]);
  if (typeof value["source"] !== "string" || value["exception"] !== "InternalCompilerError") throw Error("Invalid native checkThrows action");
}
export function validateTypeMismatchData(value: unknown): asserts value is TypeMismatchDataAssertion {
  supportKeys(value,["wanted","given"]);
  for (const key of ["wanted","given"] as const) {
    const selected = value[key];
    if (typeof selected !== "string" || !["string","number","boolean"].includes(selected)) throw Error("Unsupported native mismatch builtin");
  }
}
export function validateModuleDiagnostics(value: unknown): asserts value is ModuleDiagnosticsAssertion {
  if (!object(value)) throw Error("Invalid native module diagnostic assertion");
  if ("errors" in value) {
    supportKeys(value,["module","errors"]);
    if (!natural(value["errors"]) || Number(value["errors"]) > 256) throw Error("Invalid native module error count");
  } else {
    supportKeys(value,["module","moduleIndex","kind"]);
    if (!natural(value["moduleIndex"]) || Number(value["moduleIndex"]) >= 256 || !name(value["kind"])) throw Error("Invalid native module error selection");
  }
  if (!name(value["module"],4096)) throw Error("Invalid native module selection");
}

/** Only the new finite native predicates are validated here; legacy forms keep their existing validator. */
export function validateSupportAssertions(assertions: unknown): void {
  if (!Array.isArray(assertions)) throw Error("Native check assertions must be an array");
  for (const value of assertions) {
    if (!object(value)) throw Error("Invalid native check assertion");
    if ("errorAtBegin" in value) {
      const allowed = ["errorAtBegin","code","message","messageContains","messageExcludes","location","line","endLine",
        "fields","fieldOptions","fieldLocations","moduleMatchesCheck","typeMismatchData"];
      if (Object.keys(value).some(key => !allowed.includes(key)) || Object.keys(value).length < 2 ||
          !Array.isArray(value["errorAtBegin"]) || value["errorAtBegin"].length !== 2 ||
          !value["errorAtBegin"].every(part => natural(part) && part <= 2147483647))
        throw Error("Invalid native first-begin diagnostic assertion");
      if ("code" in value && (typeof value["code"] !== "string" || !value["code"]))
        throw Error("Invalid native first-begin error kind");
      if ("fields" in value && !object(value["fields"])) throw Error("Invalid native first-begin error fields");
      for (const key of ["messageContains","messageExcludes"] as const)
        if (key in value && typeof value[key] !== "string") throw Error("Invalid native first-begin error text assertion");
      if ("message" in value && typeof value["message"] !== "string" &&
          (!object(value["message"]) || Object.keys(value["message"]).length !== 1 ||
          !Array.isArray(value["message"]["oneOf"]) || !value["message"]["oneOf"].every(item => typeof item === "string")))
        throw Error("Invalid native first-begin error message assertion");
      for (const key of ["line","endLine"] as const)
        if (key in value && !natural(value[key])) throw Error("Invalid native first-begin error line assertion");
      if ("location" in value && (!Array.isArray(value["location"]) || value["location"].length !== 4 || !value["location"].every(natural)))
        throw Error("Invalid native first-begin error location assertion");
      if ("moduleMatchesCheck" in value && value["moduleMatchesCheck"] !== true)
        throw Error("Invalid native first-begin module assertion");
      for (const key of ["fieldOptions","fieldLocations"] as const)
        if (key in value && !object(value[key])) throw Error("Invalid native first-begin field assertion");
    }
    if ("tableState" in value) {
      const subjects = ["type","global","alias","exportedAlias","importedAlias","builtin","moduleReturn","typeAt","expectedTypeAt","overloadAt","diagnosticType"];
      const allowed = [...subjects,"path","module","normalized","tableState","equals","notEquals","options","kind","primitive","sameAs",
        "notSameAs","printedSameAs","subtypeOf","isSubtype","arena","results","typeParameters","properties","arguments","returns",
        "flattenedArguments","flattenedReturns","hasSelf","polarity","instantiatedTypeParameters","instantiatedTypePackParameters",
        "generics","genericPacks","name","definitionLocation","hasProperty","propertyLocations"];
      if (typeof value["tableState"] !== "string" || !["Sealed","Unsealed","Free","Generic"].includes(value["tableState"]) ||
          subjects.filter(key => key in value).length !== 1 || Object.keys(value).some(key => !allowed.includes(key)))
        throw Error("Invalid native raw table-state assertion");
      for (const key of ["type","global","alias","exportedAlias","module"] as const)
        if (key in value && !name(value[key],4096)) throw Error("Invalid native table-state selector name");
      if ("moduleReturn" in value && value["moduleReturn"] !== true) throw Error("Invalid native table-state pack selector");
      for (const key of ["typeAt","expectedTypeAt","overloadAt"] as const)
        if (key in value && (!Array.isArray(value[key]) || value[key].length !== 2 ||
            !value[key].every(part => natural(part) && part <= 2147483647)))
          throw Error("Invalid native table-state position selector");
      if ("importedAlias" in value && (!Array.isArray(value["importedAlias"]) || value["importedAlias"].length !== 2 ||
          !value["importedAlias"].every(part => name(part,4096)))) throw Error("Invalid native table-state imported alias");
      if ("diagnosticType" in value && (!Array.isArray(value["diagnosticType"]) || value["diagnosticType"].length !== 2 ||
          !natural(value["diagnosticType"][0]) || !name(value["diagnosticType"][1]))) throw Error("Invalid native table-state diagnostic selector");
      if ("builtin" in value && (typeof value["builtin"] !== "string" ||
          !["number","string","boolean","any","nil","error","unknown","never","function","table"].includes(value["builtin"])))
        throw Error("Invalid native table-state builtin selector");
    }
    if ("typeMismatchData" in value) {
      if (!("errorAtBegin" in value)) {
        supportKeys(value,["error","typeMismatchData"]);
        if (!natural(value["error"])) throw Error("Invalid native structural diagnostic index");
      }
      validateTypeMismatchData(value["typeMismatchData"]);
    }
    if ("moduleDiagnostics" in value) {
      supportKeys(value,["moduleDiagnostics"]);
      validateModuleDiagnostics(value["moduleDiagnostics"]);
    }
  }
}

export function validateNativeCheckEntrypoint(check: { entrypoint?: unknown; module?: unknown; mode?: unknown }): void {
  if (check.entrypoint === undefined) return;
  if (check.entrypoint !== "module" || !name(check.module,4096) || check.mode !== undefined)
    throw Error("Native named check requires entrypoint module, explicit module and no mode override");
}

/** Captures retain the actual fixture-owned FunctionType, never a clone or reacquired type. */
export class NativeCaseCaptures {
  private readonly values = new Map<string,CaptureHandle>();
  constructor(private readonly fixture: NativeFixture) {}
  capture(request: CaptureGlobalFunction): void {
    validateCaptureGlobalFunction(request);
    if (this.values.has(request.as)) throw Error("Duplicate native capture label");
    if (this.values.size >= 16) throw Error("Native case capture limit16");
    this.values.set(request.as,this.fixture.capture(request.global,request.property));
  }
  assert(request: ExpectCapturedLevels): void {
    validateCapturedLevels(request);
    const capture = this.values.get(request.capture);
    if (!capture) throw Error("Missing native case capture: "+request.capture);
    const actual = this.fixture.levels(capture);
    expect(actual.after[0],"retained native FunctionType level").toBe(actual.before[0]);
    expect(actual.after[1],"retained native FunctionType subLevel").toBe(actual.before[1]);
  }
}

/** Eligibility and exact fixture/body flags are applied by the registered caller first. */
export function runCheckThrows(fixture: NativeFixture, check: CheckThrows): void {
  validateCheckThrows(check);
  fixture.source("MainModule",check.source);
  const actual = fixture.observe("check_nonstrict","MainModule",nonStrictDefinitions);
  expect(actual.status,"native expected InternalCompilerError").toBe("internal-compiler-error");
}
const tuple = (value: unknown) => Array.isArray(value) && value.length === 4 && value.every(natural);
function nullableString(value: unknown): void { if (value !== null && typeof value !== "string") throw Error("Invalid nullable native documentation/module assertion"); }
export function validateDefinitionType(assertion: unknown, depth = 0): void {
  if (depth > 8) throw Error("Native definition assertion depth exceeds8");
  keys(assertion,["rawKind","documentation","definitionModuleName","sameAsBuiltin","properties","definition"]);
  const rawKind = assertion["rawKind"];
  if (rawKind !== undefined && (typeof rawKind !== "string" || !["extern","function","table"].includes(rawKind))) throw Error("Invalid raw native kind assertion");
  for (const key of ["documentation","definitionModuleName"] as const) if (key in assertion) nullableString(assertion[key]);
  const sameAsBuiltin = assertion["sameAsBuiltin"];
  if (sameAsBuiltin !== undefined && (typeof sameAsBuiltin !== "string" || !["number","string","any"].includes(sameAsBuiltin))) throw Error("Invalid native builtin identity assertion");
  const definition = assertion["definition"];
  if (definition !== undefined) {
    keys(definition,["module","location","originalName","varargPresent"],["module","location","originalName","varargPresent"]);
    nullableString(definition["module"]);
    if (!tuple(definition["location"]) || !tuple(definition["originalName"]) || typeof definition["varargPresent"] !== "boolean")
      throw Error("Invalid native function definition assertion");
  }
  const properties = assertion["properties"];
  if (properties !== undefined) {
    if (!object(properties)) throw Error("Invalid native own-property assertions");
    for (const [name,property] of Object.entries(properties)) {
      keys(property,["count","documentation","readable","read"],["count"]);
      if (!name || (property["count"] !== 0 && property["count"] !== 1)) throw Error("Invalid native own-property count assertion");
      if ("documentation" in property) nullableString(property["documentation"]);
      if (property["readable"] !== undefined && typeof property["readable"] !== "boolean") throw Error("Invalid native property readability assertion");
      if (property["read"] !== undefined) validateDefinitionType(property["read"],depth+1);
      if (property["count"] === 0 && Object.keys(property).length !== 1) throw Error("Absent property cannot carry positive facts");
    }
  }
}
export function validateDefinitionAssertions(assertions: unknown): void {
  if (!Array.isArray(assertions) || !assertions.length) throw Error("Definition action requires immediate assertions");
  for (const value of assertions) {
    const assertion: unknown = value;
    if (!object(assertion)) throw Error("Invalid native definition assertion");
    if ("success" in assertion || "modulePresent" in assertion) {
      const key = "success" in assertion ? "success" : "modulePresent"; keys(assertion,[key]);
      if (typeof assertion[key] !== "boolean") throw Error("Invalid native definition boolean assertion");
    } else if ("parseErrors" in assertion || "definitionErrors" in assertion) {
      const key = "parseErrors" in assertion ? "parseErrors" : "definitionErrors"; keys(assertion,[key]);
      if (!natural(assertion[key])) throw Error("Invalid native definition error count");
    } else if ("sourceModuleName" in assertion) {
      keys(assertion,["sourceModuleName","sourceHumanReadableName"]);
      if (typeof assertion["sourceModuleName"] !== "string" || (assertion["sourceHumanReadableName"] !== undefined && typeof assertion["sourceHumanReadableName"] !== "string")) throw Error("Invalid native definition source labels");
    } else if ("parseError" in assertion || "definitionError" in assertion) {
      const key = "parseError" in assertion ? "parseError" : "definitionError";
      keys(assertion,key === "parseError" ? [key,"message","location"] : [key,"kind","message","location"]);
      if (!natural(assertion[key]) || (assertion["message"] !== undefined && typeof assertion["message"] !== "string") ||
        ("kind" in assertion && typeof assertion["kind"] !== "string") || (assertion["location"] !== undefined && !tuple(assertion["location"]))) throw Error("Invalid native definition diagnostic assertion");
    } else if ("binding" in assertion || "alias" in assertion) {
      const key = "binding" in assertion ? "binding" : "alias"; keys(assertion,[key]);
      const selection = assertion[key]; keys(selection,key === "binding" ? ["name","present","documentation","type"] : ["name","present","type"],["name","present"]);
      if (typeof selection["name"] !== "string" || !selection["name"] || typeof selection["present"] !== "boolean") throw Error("Invalid native global presence assertion");
      if ("documentation" in selection) nullableString(selection["documentation"]);
      if (selection["type"] !== undefined) validateDefinitionType(selection["type"]);
      if (!selection["present"] && Object.keys(selection).some(key => !["name","present"].includes(key))) throw Error("Absent global cannot carry positive facts");
    } else throw Error("Unsupported native definition assertion");
  }
}

const location = (value: NativeLocation): LocationTuple => [value.begin.line,value.begin.column,value.end.line,value.end.column];
export function assertDefinitionType(fixture: NativeFixture, type: TypeHandle, assertion: DefinitionTypeAssertion): void {
  validateDefinitionType(assertion);
  const facts = fixture.facts(type);
  if (assertion.rawKind !== undefined) {
    if (assertion.rawKind === "table") expect(facts.rawTable).toBe(true);
    else expect(fixture.identical(type,fixture.follow(type)),"original raw native structural kind").toBe(true);
    expect(facts.kind).toBe(assertion.rawKind);
  }
  if ("documentation" in assertion) expect(facts.documentation).toBe(assertion.documentation);
  if ("definitionModuleName" in assertion) expect(facts.definitionModuleName).toBe(assertion.definitionModuleName);
  if (assertion.sameAsBuiltin) expect(fixture.identical(type,fixture.builtin(fixture.context(),assertion.sameAsBuiltin))).toBe(true);
  for (const [name,property] of Object.entries(assertion.properties ?? {})) {
    expect(fixture.propertyNames(type).filter(key => key === name).length,"own property "+name).toBe(property.count);
    if (property.count === 0) continue;
    const actual = fixture.propertyFacts(type,name);
    if ("documentation" in property) expect(actual.documentation).toBe(property.documentation);
    if (property.readable !== undefined) expect(actual.readable).toBe(property.readable);
    if (property.read) assertDefinitionType(fixture,fixture.child(type,"read",name),property.read);
  }
  if (assertion.definition) {
    const actual = facts.definition; expect(actual,"real native function definition").not.toBeNull();
    expect(actual!.module).toBe(assertion.definition.module);
    expect(location(actual!)).toEqual(assertion.definition.location);
    expect(actual!.varargPresent).toBe(assertion.definition.varargPresent);
    expect(location({begin:actual!.nameBegin,end:actual!.nameEnd})).toEqual(assertion.definition.originalName);
  }
}
export function runDefinitionAction(fixture: NativeFixture, source: string, mandatory: boolean, assertions: DefinitionAssertion[]): void {
  validateDefinitionAssertions(assertions);
  const observed = fixture.observe("definition",source);
  if (observed.status !== "ok") throw Error("Native definition operation failed: "+observed.status+": "+observed.message);
  if (typeof observed.success !== "boolean" || !Array.isArray(observed.parseErrors) || !Array.isArray(observed["diagnostics"]) ||
    typeof observed["modulePresent"] !== "boolean" || typeof observed["sourceModuleName"] !== "string" || typeof observed["sourceHumanReadableName"] !== "string")
    throw Error("Incomplete native definition result");
  const result = observed as unknown as NativeDefinitionResult;
  if (mandatory) expect(result.success,"mandatory native definition setup").toBe(true);
  for (const assertion of assertions) {
    if ("success" in assertion) expect(result.success).toBe(assertion.success);
    else if ("parseErrors" in assertion) expect(result.parseErrors).toHaveLength(assertion.parseErrors);
    else if ("definitionErrors" in assertion) expect(result.diagnostics).toHaveLength(assertion.definitionErrors);
    else if ("modulePresent" in assertion) expect(result.modulePresent).toBe(assertion.modulePresent);
    else if ("sourceModuleName" in assertion) {
      expect(result.sourceModuleName).toBe(assertion.sourceModuleName);
      if (assertion.sourceHumanReadableName !== undefined) expect(result.sourceHumanReadableName).toBe(assertion.sourceHumanReadableName);
    } else if ("parseError" in assertion || "definitionError" in assertion) {
      const error = "parseError" in assertion ? result.parseErrors[assertion.parseError] : result.diagnostics[assertion.definitionError];
      expect(error,"actual ordered native definition diagnostic").toBeDefined();
      if (assertion.message !== undefined) expect(error!.message).toBe(assertion.message);
      if (assertion.location) expect(location(error!)).toEqual(assertion.location);
      if ("kind" in assertion) expect((error as Omit<NativeDiagnostic,"nativeIndex">).kind).toBe(assertion.kind);
    } else {
      const binding = "binding" in assertion, selected = binding ? assertion.binding : assertion.alias;
      const context = fixture.context();
      const lookup = fixture.observe(binding ? "binding_facts" : "global_alias",context.session,context.revision,selected.name);
      const missing = binding ? "Missing native global binding: "+selected.name : "Missing native global alias: "+selected.name;
      if (!selected.present) {
        expect(lookup.status).toBe("error"); expect(lookup.message).toBe(missing);
        continue;
      }
      if (lookup.status !== "ok") throw Error("Native global selection failed: "+lookup.status+": "+lookup.message);
      if ("documentation" in selected) expect(lookup["documentation"]).toBe(selected.documentation);
      if (selected.type) assertDefinitionType(fixture,binding ? fixture.global(context,selected.name) : fixture.globalAlias(context,selected.name),selected.type);
    }
  }
}
