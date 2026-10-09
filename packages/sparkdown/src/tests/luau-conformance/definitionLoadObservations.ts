// Bounded observations of real definition results and global type metadata.
// No query assigns documentation, clones types, or manufactures a missing value.
import { errorFields, errorToString } from "../../compiler/typecheck/Error";
import type { Frontend, LoadDefinitionFileResult } from "../../compiler/typecheck/Frontend";
import type { Location } from "../../compiler/typecheck/Location";
import type { Module } from "../../compiler/typecheck/Module";
import { toString } from "../../compiler/typecheck/ToString";
import { flatten, follow, get, type TypeId } from "../../compiler/typecheck/Type";

export type DefinitionLocation = [number, number, number, number];
const location = (value: Location): DefinitionLocation => [
  value.begin.line, value.begin.column, value.end.line, value.end.column,
];

/** Module errors retain their original reporting order, unlike check-result accumulation. */
export function definitionLoadFacts(result: LoadDefinitionFileResult) {
  return {
    success: result.success,
    hasModule: result.module !== undefined,
    hasSourceModule: result.sourceModule !== undefined,
    moduleName: result.module?.name,
    moduleHumanReadableName: result.module?.humanReadableName,
    sourceModuleName: result.sourceModule?.name,
    sourceModuleHumanReadableName: result.sourceModule?.humanReadableName,
    parseErrors: result.parseErrors.map((error) => ({
      code: "SyntaxError" as const,
      message: error.message,
      location: location(error.location),
    })),
    checkedErrors: result.module?.errors.map((error) => ({
      code: error.data.kind,
      message: errorToString(error),
      location: location(error.location),
      module: error.moduleName,
      fields: errorFields(error),
    })) ?? [],
  };
}

export type DefinitionMetadataSelector = (
  | { binding: string }
  | { globalType: string }
  | { builtin: "string" | "number" | "boolean" | "any" | "unknown" | "never" | "nil" }
) & { path?: ({ property: string } | { argument: number } | { result: number })[] };

export interface DefinitionMetadata {
  kind: string;
  print(): string;
  is(other: DefinitionMetadata): boolean;
  bindingDocumentationSymbol?: string;
  typeDocumentationSymbol?: string;
  propertyDocumentationSymbol?: string;
  propertyCount?: number;
  definitionModuleName?: string;
  functionDefinition?: {
    definitionModuleName?: string;
    definitionLocation: DefinitionLocation;
    varargLocation?: DefinitionLocation;
    originalNameLocation: DefinitionLocation;
  };
}

const identities = new WeakMap<DefinitionMetadata, TypeId>();

/** Absence is a result, rather than an exception or an expected-value placeholder. */
export function definitionMetadata(
  frontend: Frontend,
  selector: DefinitionMetadataSelector,
): DefinitionMetadata | undefined {
  const scope = frontend.globals.globalScope;
  const binding = "binding" in selector
    ? scope.linearSearchForBinding(selector.binding)
    : undefined;
  let selected = "binding" in selector
    ? binding?.typeId
    : "globalType" in selector
      ? scope.lookupType(selector.globalType)?.type
      : frontend.builtinTypes[`${selector.builtin}Type`];
  let propertyDocumentationSymbol: string | undefined;
  for (const step of selector.path ?? []) {
    if (!selected) return undefined;
    const type = follow(selected);
    propertyDocumentationSymbol = undefined;
    if ("property" in step) {
      let prop = get(type, "TableType")?.props.get(step.property);
      const visited = new Set<TypeId>();
      for (let cursor: TypeId | undefined = type; cursor && !prop;) {
        cursor = follow(cursor);
        if (visited.has(cursor)) break;
        visited.add(cursor);
        const external = get(cursor, "ExternType");
        prop = external?.props.get(step.property);
        cursor = external?.parent;
      }
      selected = prop?.readTy;
      propertyDocumentationSymbol = prop?.documentationSymbol;
    } else {
      const fn = get(type, "FunctionType");
      if (!fn) return undefined;
      const index = "argument" in step ? step.argument : step.result;
      if (!Number.isSafeInteger(index) || index < 0)
        throw new Error("definition type path index must be a nonnegative integer");
      selected = flatten("argument" in step ? fn.argTypes : fn.retTypes).head[index];
    }
  }
  if (!selected) return undefined;
  const type = follow(selected);
  const external = get(type, "ExternType"), table = get(type, "TableType");
  const definition = get(type, "FunctionType")?.definition;
  const answer: DefinitionMetadata = {
    kind: type.ty.kind,
    print: () => toString(type),
    is: (other) => {
      const identity = identities.get(other);
      return identity !== undefined && follow(identity) === type;
    },
    bindingDocumentationSymbol: binding?.documentationSymbol,
    typeDocumentationSymbol: type.documentationSymbol,
    propertyDocumentationSymbol,
    propertyCount: (external?.props ?? table?.props)?.size,
    definitionModuleName: external?.definitionModuleName ?? table?.definitionModuleName,
    functionDefinition: definition ? {
      definitionModuleName: definition.definitionModuleName,
      definitionLocation: location(definition.definitionLocation),
      varargLocation: definition.varargLocation ? location(definition.varargLocation) : undefined,
      originalNameLocation: location(definition.originalNameLocation),
    } : undefined,
  };
  identities.set(answer, type);
  return answer;
}

/** Logical TypeArena nodes, not allocation bytes or an estimate from printed types. */
export function logicalModuleTypeCount(module: Module): number {
  return module.internalTypes.types.length;
}
