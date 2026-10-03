import { AstExprCall, visitAst } from "../../compiler/typecheck/Ast";
import {
  findExprAtPosition,
  findTypeAtPosition,
} from "../../compiler/typecheck/AstQuery";
import type { Frontend } from "../../compiler/typecheck/Frontend";
import { accumulateErrors } from "../../compiler/typecheck/Frontend";
import { Position, type Location } from "../../compiler/typecheck/Location";
import type { Module, SourceModule } from "../../compiler/typecheck/Module";
import {
  Normalizer,
  UnifierSharedState,
} from "../../compiler/typecheck/Normalize";
import { Subtyping } from "../../compiler/typecheck/Subtyping";
import { toString, toStringPack } from "../../compiler/typecheck/ToString";
import { TypeFunctionRuntime } from "../../compiler/typecheck/TypeFunction";
import {
  flatten,
  follow,
  followPack,
  get,
  getPack,
  Type,
  TypeArena,
  type TypeFun,
  type TypeId,
  type TypePackId,
} from "../../compiler/typecheck/Type";
import type {
  CheckedType,
  LocationTuple,
  PackFacts,
  TypePathStep,
  TypeSelector,
} from "./typecheckTestHarness";

function isTypeId(value: TypeId | TypePackId): value is TypeId {
  return value instanceof Type;
}
const identities = new WeakMap<CheckedType, TypeId | TypePackId>();
const contexts = new WeakMap<CheckedType, Frontend>();
const loc = (l: Location): LocationTuple => [
  l.begin.line,
  l.begin.column,
  l.end.line,
  l.end.column,
];
function facts(pack: TypePackId): PackFacts {
  const direct = getPack(followPack(pack), "TypePack");
  return {
    length: direct?.head.length,
    tail: direct ? direct.tail !== undefined : undefined,
    tailKind: direct?.tail ? followPack(direct.tail).ty.kind : undefined,
  };
}

export function queryType(
  frontend: Frontend,
  module: Module,
  source: SourceModule,
  selector: TypeSelector,
): CheckedType | undefined {
  let selected: TypeId | TypePackId | undefined, alias: TypeFun | undefined;
  if ("type" in selector)
    selected = module
      .getModuleScope()
      .linearSearchForBinding(selector.type)?.typeId;
  else if ("global" in selector)
    selected = frontend.globals.globalScope.bindings.get(
      selector.global,
    )?.typeId;
  else if ("alias" in selector) {
    alias = module.getModuleScope().lookupType(selector.alias);
    selected = alias?.type;
  } else if ("exportedAlias" in selector) {
    alias = module.exportedTypeBindings.get(selector.exportedAlias);
    selected = alias?.type;
  } else if ("importedAlias" in selector) {
    alias = module
      .getModuleScope()
      .lookupImportedType(...selector.importedAlias);
    selected = alias?.type;
  } else if ("builtin" in selector)
    selected = frontend.builtinTypes[`${selector.builtin}Type`];
  else if ("moduleReturn" in selector) selected = module.returnType;
  else if ("expectedTypeAt" in selector) {
    const expr = findExprAtPosition(
      source,
      new Position(...selector.expectedTypeAt),
    );
    selected = expr ? module.astExpectedTypes.get(expr) : undefined;
  } else if ("diagnosticType" in selector) {
    const [index, field] = selector.diagnosticType;
    const error = accumulateErrors([...source.parseErrors, ...module.errors])[
      index
    ];
    const value = error
      ? (error.data as unknown as Record<string, unknown>)[field]
      : undefined;
    if (value instanceof Type) selected = value;
  } else if ("overloadAt" in selector) {
    const position = new Position(...selector.overloadAt);
    let call: AstExprCall | undefined;
    visitAst(source.root, {
      visit: (node) => {
        if (node instanceof AstExprCall && node.location.contains(position))
          call = node;
        return true;
      },
    });
    selected = call ? module.astOverloadResolvedTypes.get(call) : undefined;
  } else
    selected = findTypeAtPosition(
      module,
      source,
      new Position(...selector.typeAt),
    );
  for (const step of selector.path ?? []) {
    if (!selected) return undefined;
    selected = stepInto(selected, step, alias);
    alias = undefined;
  }
  if (!selected) return undefined;
  const arena = new TypeArena(),
    normalizer = new Normalizer(
      arena,
      frontend.builtinTypes,
      new UnifierSharedState(),
    );
  if (selector.normalized) {
    if (!isTypeId(selected))
      throw new Error("normalization requires a type, not a pack");
    const normalized = normalizer.normalize(selected);
    if (!normalized) throw new Error("type normalization hit resource limits");
    selected = normalizer.typeFromNormal(normalized);
  }
  const subtyping = new Subtyping(
    frontend.builtinTypes,
    arena,
    normalizer,
    new TypeFunctionRuntime(),
  );
  const answer = (value: TypeId | TypePackId, tf?: TypeFun): CheckedType => {
    if (!isTypeId(value)) {
      const pack = followPack(value);
      const result: CheckedType = {
        print: (options) => toStringPack(value, options),
        kind: pack.ty.kind,
        is: (other) => {
          const identity = identities.get(other);
          return (
            !!identity && !isTypeId(identity) && followPack(identity) === pack
          );
        },
        subtypeOf: (other) => {
          const identity = identities.get(other);
          if (
            !identity ||
            isTypeId(identity) ||
            contexts.get(other) !== frontend
          )
            throw new Error(
              "pack subtyping needs a pack from this check's fixture",
            );
          const result = subtyping.isSubtypePack(
            value,
            identity,
            module.getModuleScope(),
          );
          if (result.normalizationTooComplex)
            throw new Error("pack subtyping hit resource limits");
          return result.isSubtype;
        },
        results: flatten(value).head.map((v) => answer(v)),
        returns: facts(value),
      };
      identities.set(result, value);
      contexts.set(result, frontend);
      return result;
    }
    const followed = follow(value),
      fn = get(followed, "FunctionType"),
      table = get(followed, "TableType"),
      external = get(followed, "ExternType");
    const props = table?.props ?? external?.props;
    const result: CheckedType = {
      print: (options) => toString(value, options),
      kind: followed.ty.kind,
      is: (other) => {
        const identity = identities.get(other);
        return (
          !!identity && isTypeId(identity) && follow(identity) === followed
        );
      },
      subtypeOf: (other) => {
        const identity = identities.get(other);
        if (
          !identity ||
          !isTypeId(identity) ||
          contexts.get(other) !== frontend
        )
          throw new Error(
            "type subtyping needs a type from this check's fixture",
          );
        const result = subtyping.isSubtype(
          value,
          identity,
          module.getModuleScope(),
        );
        if (result.normalizationTooComplex)
          throw new Error("subtyping hit resource limits");
        return result.isSubtype;
      },
      results: fn ? flatten(fn.retTypes).head.map((v) => answer(v)) : undefined,
      arguments: fn ? facts(fn.argTypes) : undefined,
      returns: fn ? facts(fn.retTypes) : undefined,
      hasSelf: fn?.hasSelf,
      polarity: get(followed, "GenericType")
        ? ["None", "Positive", "Negative", "Mixed", "Unknown"][
            get(followed, "GenericType")!.polarity
          ]
        : undefined,
      typeParameterCount: tf?.typeParams.length,
      propertyCount: props?.size,
      instantiatedTypeParameterCount: table?.instantiatedTypeParams.length,
      instantiatedTypePackParameterCount:
        table?.instantiatedTypePackParams.length,
      genericCount: fn?.generics.length,
      genericPackCount: fn?.genericPacks.length,
      name: table?.name ?? external?.name,
      definitionLocation: tf?.definitionLocation
        ? loc(tf.definitionLocation)
        : undefined,
      propertyNames: props ? [...props.keys()] : undefined,
      propertyLocations: props
        ? Object.fromEntries(
            [...props].map(([name, p]) => [
              name,
              {
                location: p.location ? loc(p.location) : null,
                typeLocation: p.typeLocation ? loc(p.typeLocation) : null,
              },
            ]),
          )
        : undefined,
    };
    identities.set(result, value);
    contexts.set(result, frontend);
    return result;
  };
  return answer(selected, alias);
}

function stepInto(
  value: TypeId | TypePackId,
  step: TypePathStep,
  alias?: TypeFun,
): TypeId | TypePackId | undefined {
  if (!isTypeId(value))
    return "result" in step ? flatten(value).head[step.result] : undefined;
  if ("typeParameter" in step) return alias?.typeParams[step.typeParameter]?.ty;
  const type = follow(value),
    table = get(type, "TableType");
  if ("property" in step) {
    const external = get(type, "ExternType");
    if (external) {
      for (
        let current: TypeId | undefined = type;
        current;
        current = get(follow(current), "ExternType")?.parent
      ) {
        const prop = get(follow(current), "ExternType")?.props.get(
          step.property,
        );
        if (prop) return prop.readTy;
      }
      return undefined;
    }
    return table?.props.get(step.property)?.readTy;
  }
  if ("indexer" in step) {
    const indexer = table?.indexer ?? get(type, "ExternType")?.indexer;
    return step.indexer === "key"
      ? indexer?.indexType
      : indexer?.indexResultType;
  }
  if ("instantiatedTypeParameter" in step)
    return table?.instantiatedTypeParams[step.instantiatedTypeParameter];
  if ("instantiatedTypePackParameter" in step)
    return table?.instantiatedTypePackParams[
      step.instantiatedTypePackParameter
    ];
  const fn = get(type, "FunctionType");
  if (!fn) return undefined;
  if ("generic" in step) return fn.generics[step.generic];
  if ("genericPack" in step) return fn.genericPacks[step.genericPack];
  if ("argument" in step) return flatten(fn.argTypes).head[step.argument];
  return flatten(fn.retTypes).head[step.result];
}
