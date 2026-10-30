// Type-checking scopes, ported from Luau's `Scope.h`/`Scope.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).

import type { DefId, LuauSymbol } from "./Def";
import { Location } from "./Location";
import { TypeLevel, type TypeFun, type TypeId, type TypePackId } from "./Type";

export interface Binding {
  typeId: TypeId;
  location: Location;
  deprecated?: boolean;
  deprecatedSuggestion?: string;
  documentationSymbol?: string;
}

export class Scope {
  readonly children: Scope[] = [];
  readonly bindings = new Map<LuauSymbol, Binding>();
  returnType: TypePackId;
  varargPack: TypePackId | undefined;
  level: TypeLevel;
  location = new Location();

  readonly exportedTypeBindings = new Map<string, TypeFun>();
  readonly privateTypeBindings = new Map<string, TypeFun>();
  readonly typeAliasLocations = new Map<string, Location>();
  readonly typeAliasNameLocations = new Map<string, Location>();
  readonly importedModules = new Map<string, string>();
  readonly importedTypeBindings = new Map<string, Map<string, TypeFun>>();
  readonly builtinTypeNames = new Set<string>();
  readonly privateTypePackBindings = new Map<string, TypePackId>();

  readonly lvalueTypes = new Map<DefId, TypeId>();
  readonly rvalueRefinements = new Map<DefId, TypeId>();

  readonly globalsToWarn = new Set<string>();

  readonly typeAliasTypeParameters = new Map<string, TypeId>();
  readonly typeAliasTypePackParameters = new Map<string, TypePackId>();

  interiorFreeTypes: TypeId[] | undefined;
  interiorFreeTypePacks: TypePackId[] | undefined;

  readonly invalidTypeAliases = new Map<string, Location>();

  private constructor(
    readonly parent: Scope | undefined,
    returnType: TypePackId,
    level: TypeLevel,
  ) {
    this.returnType = returnType;
    this.level = level;
  }

  static root(returnType: TypePackId): Scope {
    return new Scope(undefined, returnType, new TypeLevel());
  }

  static child(parent: Scope, subLevel = 0): Scope {
    const level = parent.level.incr().incr();
    level.subLevel = subLevel;
    return new Scope(parent, parent.returnType, level);
  }

  addBuiltinTypeBinding(name: string, tyFun: TypeFun): void {
    this.exportedTypeBindings.set(name, tyFun);
    this.builtinTypeNames.add(name);
  }

  lookup(sym: LuauSymbol): TypeId | undefined {
    return this.lookupEx(sym)?.binding.typeId;
  }

  lookupEx(sym: LuauSymbol): { binding: Binding; scope: Scope } | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const b = s.bindings.get(sym);
      if (b) return { binding: b, scope: s };
    }
    return undefined;
  }

  lookupDefEx(def: DefId): { type: TypeId; scope: Scope } | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const lv = s.lvalueTypes.get(def);
      if (lv) return { type: lv, scope: s };
      const rv = s.rvalueRefinements.get(def);
      if (rv) return { type: rv, scope: s };
    }
    return undefined;
  }

  lookupUnrefinedType(def: DefId): TypeId | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const ty = s.lvalueTypes.get(def);
      if (ty) return ty;
    }
    return undefined;
  }

  lookupRValueRefinementType(def: DefId): TypeId | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const ty = s.rvalueRefinements.get(def);
      if (ty) return ty;
    }
    return undefined;
  }

  lookupDef(def: DefId): TypeId | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const rv = s.rvalueRefinements.get(def);
      if (rv) return rv;
      const lv = s.lvalueTypes.get(def);
      if (lv) return lv;
    }
    return undefined;
  }

  lookupType(name: string): TypeFun | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const exported = s.exportedTypeBindings.get(name);
      if (exported) return exported;
      const priv = s.privateTypeBindings.get(name);
      if (priv) return priv;
    }
    return undefined;
  }

  lookupImportedType(moduleAlias: string, name: string): TypeFun | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const found = s.importedTypeBindings.get(moduleAlias)?.get(name);
      if (found) return found;
    }
    return undefined;
  }

  lookupPack(name: string): TypePackId | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const found = s.privateTypePackBindings.get(name);
      if (found) return found;
    }
    return undefined;
  }

  linearSearchForBinding(name: string, traverseScopeChain = true): Binding | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      for (const [sym, binding] of s.bindings) {
        if ((typeof sym === "string" ? sym : sym.name) === name) return binding;
      }
      if (!traverseScopeChain) break;
    }
    return undefined;
  }

  inheritAssignments(childScope: Scope): void {
    for (const [k, a] of childScope.lvalueTypes) this.lvalueTypes.set(k, a);
  }

  inheritRefinements(childScope: Scope): void {
    for (const [k, a] of childScope.rvalueRefinements) {
      if (this.lookupDef(k)) this.rvalueRefinements.set(k, a);
    }
  }

  shouldWarnGlobal(name: string): boolean {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      if (s.globalsToWarn.has(name)) return true;
    }
    return false;
  }

  isInvalidTypeAlias(name: string): Location | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const loc = s.invalidTypeAliases.get(name);
      if (loc) return loc;
    }
    return undefined;
  }

  findNarrowestScopeContaining(location: Location): Scope {
    let bestScope: Scope = this;
    let didNarrow: boolean;
    do {
      didNarrow = false;
      for (const scope of bestScope.children) {
        if (scope.location.encloses(location)) {
          bestScope = scope;
          didNarrow = true;
          break;
        }
      }
    } while (didNarrow && bestScope.children.length > 0);
    return bestScope;
  }
}

export function subsumesStrict(left: Scope | undefined, right: Scope | undefined): boolean {
  if (!left || !right) return false;
  for (let r: Scope | undefined = right; r; r = r.parent) {
    if (r.parent === left) return true;
  }
  return false;
}

export function subsumes(left: Scope | undefined, right: Scope | undefined): boolean {
  if (!left || !right) return false;
  return left === right || subsumesStrict(left, right);
}

export function maxScope(left: Scope | undefined, right: Scope | undefined): Scope | undefined {
  return subsumes(left, right) ? right : left;
}
