// A checked module, ported from Luau's `Module.h`/`Module.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`). The constraint generator, the solver
// and the checkers record what they learn about the program here.

import type { AstExpr, AstNode, AstStat, AstStatBlock, AstType, AstTypePack } from "./Ast";
import { DefArena, RefinementKeyArena } from "./Def";
import { LuauTypeError } from "./Error";
import { Location } from "./Location";
import type { Scope } from "./Scope";
import { Substitution } from "./Substitution";
import {
  errorType,
  get,
  getPack,
  is,
  isPack,
  TableState,
  TypeArena,
  TypeFun,
  TypeFunctionInstanceState,
  TypeLevel,
  type BuiltinTypes,
  type TypeId,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
} from "./Type";
import { TypeOnceVisitor } from "./VisitType";

/** How strictly a module is checked (Luau's `Mode`). */
export const enum Mode {
  /** No inference. */
  NoCheck,
  /** Unannotated symbols are `any`. */
  Nonstrict,
  /** Unannotated symbols are inferred. */
  Strict,
  /** A definition module, with its own parsing rules. */
  Definition,
}

/** A `--!` comment at the top of a module (Luau's `HotComment`). */
export interface HotComment {
  header: boolean;
  location: Location;
  content: string;
}

/** The parsed source of a module (Luau's `SourceModule`). */
export interface SourceModule {
  name: string;
  humanReadableName: string;
  root: AstStatBlock;
  mode?: Mode;
  hotcomments: HotComment[];
  parseErrors: LuauTypeError[];
}

/** A module a `require` names (Luau's `ModuleInfo`). */
export interface ModuleInfo {
  name: string;
  optional: boolean;
}

/** Finds the modules a program requires (Luau's `ModuleResolver`). */
export interface ModuleResolver {
  /** The module a `require` argument names, or undefined when it cannot tell. */
  resolveModuleInfo(currentModuleName: string, pathExpr: AstExpr): ModuleInfo | undefined;
  /** A checked module, or undefined when it is unknown or still being checked. */
  getModule(moduleName: string): Module | undefined;
  moduleExists(moduleName: string): boolean;
  getHumanReadableModuleName(moduleName: string): string;
}

/** A resolver that knows no modules (Luau's `NullModuleResolver`). */
export class NullModuleResolver implements ModuleResolver {
  resolveModuleInfo(): ModuleInfo | undefined {
    return undefined;
  }

  getModule(): Module | undefined {
    return undefined;
  }

  moduleExists(): boolean {
    return false;
  }

  getHumanReadableModuleName(moduleName: string): string {
    return moduleName;
  }
}

/** A cycle of `require`s (Luau's `RequireCycle`). */
export interface RequireCycle {
  location: Location;
  /** One path from a `require` back to the module that started the cycle. */
  path: string[];
}

/** Whether a function type has generics anywhere under it (Luau's `GenericTypeFinder`). */
export class GenericTypeFinder extends TypeOnceVisitor {
  found = false;

  constructor() {
    super("GenericTypeFinder", true);
  }

  override visitType(_ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "FunctionType":
        if (v.hasNoFreeOrGenericTypes) return false;
        if (v.generics.length || v.genericPacks.length) this.found = true;
        return !this.found;
      case "TableType":
        if (v.state === TableState.Generic) this.found = true;
        return !this.found;
      case "GenericType":
        this.found = true;
        return false;
      default:
        return !this.found;
    }
  }

  override visitTypePack(_tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "GenericTypePack") {
      this.found = true;
      return false;
    }
    return !this.found;
  }
}

export class Module {
  checkedInNewSolver = false;
  name = "";
  humanReadableName = "";

  readonly interfaceTypes = new TypeArena();
  readonly internalTypes: TypeArena;

  root: AstStatBlock | undefined;

  /** Every scope with the location it covers; the module scope comes first. */
  readonly scopes: [Location, Scope][] = [];

  readonly astTypes = new Map<AstExpr, TypeId>();
  readonly astTypePacks = new Map<AstExpr, TypePackId>();
  readonly astExpectedTypes = new Map<AstExpr, TypeId>();
  /**
   * The unspecialized type of the function each call calls; a call through
   * `__call` maps to the metamethod.
   */
  readonly astOriginalCallTypes = new Map<AstNode, TypeId>();
  /** The overload or specialization of the function each call selected. */
  readonly astOverloadResolvedTypes = new Map<AstNode, TypeId>();
  /** The type of `next` in each `for ... in` loop. */
  readonly astForInNextTypes = new Map<AstNode, TypeId>();
  readonly astResolvedTypes = new Map<AstType, TypeId>();
  readonly astResolvedTypePacks = new Map<AstTypePack, TypePackId>();
  readonly astTypeReferenceLookupFailures = new Set<AstType>();
  readonly astTypePackReferenceLookupFailures = new Set<AstTypePack>();
  /** The result type of each compound assignment, such as `foo += 1`. */
  readonly astCompoundAssignResultTypes = new Map<AstStat, TypeId>();
  readonly upperBoundContributors = new Map<TypeId, [Location, TypeId][]>();
  /** The scope each node creates. */
  readonly astScopes = new Map<AstNode, Scope>();
  readonly typeFunctionAliases: TypeFun[] = [];

  readonly declaredGlobals = new Map<string, TypeId>();
  errors: LuauTypeError[] = [];
  mode: Mode = Mode.Strict;
  returnType: TypePackId | undefined;
  exportedTypeBindings = new Map<string, TypeFun>();

  readonly defArena = new DefArena();
  readonly keyArena = new RefinementKeyArena();

  constraintGenerationDidNotComplete = true;

  constructor(internalTypes: TypeArena = new TypeArena()) {
    this.internalTypes = internalTypes;
  }

  hasModuleScope(): boolean {
    return this.scopes.length > 0;
  }

  getModuleScope(): Scope {
    const first = this.scopes[0];
    if (!first) throw new Error("the module has no scope");
    return first[1];
  }

  /**
   * Clones the module's public interface (its return type, exported type
   * aliases and declared globals) into `interfaceTypes`, so that the types
   * other modules see never point back into this one's internal arena.
   */
  clonePublicInterface(builtinTypes: BuiltinTypes): void {
    const moduleScope = this.getModuleScope();
    const clonePublicInterface = new ClonePublicInterface(builtinTypes, this);
    moduleScope.returnType = clonePublicInterface.cloneTypePack(moduleScope.returnType);
    for (const [name, tf] of moduleScope.exportedTypeBindings) {
      moduleScope.exportedTypeBindings.set(name, clonePublicInterface.cloneTypeFun(tf));
    }
    for (const [name, ty] of this.declaredGlobals) {
      this.declaredGlobals.set(name, clonePublicInterface.cloneType(ty));
    }
    for (let i = 0; i < this.typeFunctionAliases.length; i++) {
      this.typeFunctionAliases[i] = clonePublicInterface.cloneTypeFun(this.typeFunctionAliases[i]!);
    }
    if (clonePublicInterface.internalTypeEscaped) {
      this.errors.push(
        new LuauTypeError(
          new Location(),
          {
            kind: "InternalError",
            message: "An internal type is escaping this module; please report this bug at https://github.com/luau-lang/luau/issues",
          },
          this.name,
        ),
      );
    }
    this.returnType = moduleScope.returnType;
    this.exportedTypeBindings = new Map(moduleScope.exportedTypeBindings);
  }
}

class ClonePublicInterface extends Substitution {
  internalTypeEscaped = false;

  constructor(
    readonly builtinTypes: BuiltinTypes,
    readonly module: Module,
  ) {
    super(module.interfaceTypes);
  }

  isDirty(ty: TypeId): boolean {
    if (ty.owningArena === this.module.internalTypes) return true;
    const ftv = get(ty, "FunctionType");
    if (ftv) return ftv.level.level !== 0;
    const ttv = get(ty, "TableType");
    if (ttv) return ttv.level.level !== 0;
    return false;
  }

  isDirtyPack(tp: TypePackId): boolean {
    return tp.owningArena === this.module.internalTypes;
  }

  override ignoreChildrenVisit(ty: TypeId): boolean {
    return ty.owningArena !== this.module.internalTypes;
  }

  override ignoreChildrenVisitPack(tp: TypePackId): boolean {
    return tp.owningArena !== this.module.internalTypes;
  }

  clean(ty: TypeId): TypeId {
    let result = this.clone(ty);
    const ftv = get(result, "FunctionType");
    const ttv = get(result, "TableType");
    if (ftv) {
      if (!ftv.generics.length && !ftv.genericPacks.length) {
        const marker = new GenericTypeFinder();
        marker.traverse(result);
        if (!marker.found) ftv.hasNoFreeOrGenericTypes = true;
      }
      ftv.level = new TypeLevel(0, 0);
    } else if (ttv) {
      ttv.level = new TypeLevel(0, 0);
      ttv.scope = undefined;
      ttv.state = TableState.Sealed;
    }
    if (is(ty, "FreeType", "BlockedType", "PendingExpansionType")) {
      this.internalTypeEscaped = true;
      result = this.builtinTypes.errorType;
    } else {
      const genericty = get(result, "GenericType");
      if (genericty) {
        genericty.scope = undefined;
      } else {
        const tfit = get(ty, "TypeFunctionInstanceType");
        if (tfit) {
          if (tfit.state === TypeFunctionInstanceState.Stuck) {
            result = this.arena.addType(errorType(ty));
          } else {
            const resultTfit = get(result, "TypeFunctionInstanceType");
            if (resultTfit) resultTfit.state = tfit.state;
          }
        }
      }
    }
    return result;
  }

  cleanPack(tp: TypePackId): TypePackId {
    if (isPack(tp, "FreeTypePack", "BlockedTypePack")) {
      this.internalTypeEscaped = true;
      return this.builtinTypes.errorTypePack;
    }
    const clonedTp = this.clonePack(tp);
    const gtp = getPack(clonedTp, "GenericTypePack");
    if (gtp) gtp.scope = undefined;
    return clonedTp;
  }

  cloneType(ty: TypeId): TypeId {
    const result = this.substitute(ty);
    if (result) return result;
    this.module.errors.push(new LuauTypeError(this.module.scopes[0]![0], { kind: "UnificationTooComplex" }));
    return this.builtinTypes.errorType;
  }

  cloneTypePack(tp: TypePackId): TypePackId {
    const result = this.substitutePack(tp);
    if (result) return result;
    this.module.errors.push(new LuauTypeError(this.module.scopes[0]![0], { kind: "UnificationTooComplex" }));
    return this.builtinTypes.errorTypePack;
  }

  cloneTypeFun(tf: TypeFun): TypeFun {
    const typeParams = tf.typeParams.map((typeParam) => ({
      ty: this.cloneType(typeParam.ty),
      defaultValue: typeParam.defaultValue ? this.cloneType(typeParam.defaultValue) : undefined,
    }));
    const typePackParams = tf.typePackParams.map((typePackParam) => ({
      tp: this.cloneTypePack(typePackParam.tp),
      defaultValue: typePackParam.defaultValue ? this.cloneTypePack(typePackParam.defaultValue) : undefined,
    }));
    const type = this.cloneType(tf.type);
    return new TypeFun(type, typeParams, typePackParams, tf.definitionLocation);
  }
}
