// Definitions and refinements for the data-flow graph, ported from Luau's
// `Def.h`/`Def.cpp` and `Refinement.h`/`Refinement.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).
//
// A def is a symbolic value the data-flow graph binds to a place that can
// hold a Luau value: a cell for a single value, or a phi for the values that
// may flow into a place where branches join.

import type { AstLocal } from "./Ast";
import type { Location } from "./Location";
import type { TypeId } from "./Type";

/** A local (by its declaration) or a global (by its name). */
export type LuauSymbol = AstLocal | string;

export function symbolName(sym: LuauSymbol | undefined): string | undefined {
  if (sym === undefined) return undefined;
  return typeof sym === "string" ? sym : sym.name;
}

export interface Cell {
  readonly kind: "Cell";
  subscripted: boolean;
}

export interface Phi {
  readonly kind: "Phi";
  operands: Def[];
}

export class Def {
  constructor(
    public v: Cell | Phi,
    public name: LuauSymbol | undefined,
    public location: Location | undefined,
  ) {}
}

export type DefId = Def;

export function getCell(def: DefId): Cell | undefined {
  return def.v.kind === "Cell" ? def.v : undefined;
}

export function getPhi(def: DefId): Phi | undefined {
  return def.v.kind === "Phi" ? def.v : undefined;
}

export function containsSubscriptedDefinition(def: DefId): boolean {
  const cell = getCell(def);
  if (cell) return cell.subscripted;
  const phi = getPhi(def);
  if (phi) return phi.operands.some(containsSubscriptedDefinition);
  return false;
}

/** The cells a def stands for: the def itself when it is a cell, or the operands of a phi, recursively (Luau's `collectOperands`). */
export function collectOperands(def: DefId, operands: DefId[]): void {
  if (operands.includes(def)) return;
  if (getCell(def)) {
    operands.push(def);
    return;
  }
  const phi = getPhi(def);
  if (phi) {
    // A trivial phi has no operands, so it stands for itself.
    if (phi.operands.length === 0) {
      operands.push(def);
      return;
    }
    for (const operand of phi.operands) collectOperands(operand, operands);
  }
}

export class DefArena {
  freshCell(sym: LuauSymbol | undefined, location: Location | undefined, subscripted = false): DefId {
    return new Def({ kind: "Cell", subscripted }, sym, location);
  }

  phi(defs: DefId[]): DefId {
    const operands: DefId[] = [];
    for (const operand of defs) collectOperands(operand, operands);
    // A phi of one operand is that operand.
    if (operands.length === 1) return operands[0]!;
    return new Def({ kind: "Phi", operands }, undefined, undefined);
  }
}

// ---------------------------------------------------------------------------
// Refinement keys and refinements
// ---------------------------------------------------------------------------

/**
 * The place a refinement applies to: a def, or a property reached through a
 * chain of property accesses from one (`a.b.c` refines `c` of `b` of `a`).
 */
export class RefinementKey {
  constructor(
    public parent: RefinementKey | undefined,
    public def: DefId,
    public propName: string | undefined,
  ) {}
}

export class RefinementKeyArena {
  leaf(def: DefId): RefinementKey {
    return new RefinementKey(undefined, def, undefined);
  }

  node(parent: RefinementKey | undefined, def: DefId, propName: string): RefinementKey {
    return new RefinementKey(parent, def, propName);
  }
}

export type Refinement =
  | { readonly kind: "Variadic"; refinements: RefinementId[] }
  | { readonly kind: "Negation"; refinement: RefinementId }
  | { readonly kind: "Conjunction"; lhs: RefinementId; rhs: RefinementId }
  | { readonly kind: "Disjunction"; lhs: RefinementId; rhs: RefinementId }
  | { readonly kind: "Equivalence"; lhs: RefinementId; rhs: RefinementId }
  | { readonly kind: "Proposition"; key: RefinementKey; discriminantTy: TypeId; implicitFromCall: boolean };

/** A refinement, or undefined for none, as Luau's nullable `RefinementId`. */
export type RefinementId = Refinement | undefined;

export class RefinementArena {
  variadic(refis: RefinementId[]): RefinementId {
    if (!refis.some((r) => r !== undefined)) return undefined;
    return { kind: "Variadic", refinements: refis };
  }

  negation(refinement: RefinementId): RefinementId {
    if (!refinement) return undefined;
    return { kind: "Negation", refinement };
  }

  conjunction(lhs: RefinementId, rhs: RefinementId): RefinementId {
    if (!lhs && !rhs) return undefined;
    return { kind: "Conjunction", lhs, rhs };
  }

  disjunction(lhs: RefinementId, rhs: RefinementId): RefinementId {
    if (!lhs && !rhs) return undefined;
    return { kind: "Disjunction", lhs, rhs };
  }

  equivalence(lhs: RefinementId, rhs: RefinementId): RefinementId {
    if (!lhs && !rhs) return undefined;
    return { kind: "Equivalence", lhs, rhs };
  }

  proposition(key: RefinementKey | undefined, discriminantTy: TypeId): RefinementId {
    if (!key) return undefined;
    return { kind: "Proposition", key, discriminantTy, implicitFromCall: false };
  }

  implicitProposition(key: RefinementKey | undefined, discriminantTy: TypeId): RefinementId {
    if (!key) return undefined;
    return { kind: "Proposition", key, discriminantTy, implicitFromCall: true };
  }
}
