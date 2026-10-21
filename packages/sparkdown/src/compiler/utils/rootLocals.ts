import type { SyntaxNode } from "@lezer/common";
import {
  EXPLICIT,
  FLOWS,
  childEndingWith,
  scopeOf,
  statementsOf,
} from "./declarationOnly";
import { isExplicitRuleName } from "./explicitRuleNames";
import {
  VARIABLE_DEFINITION_CONTENT_NAMES,
  VARIABLE_DEFINITION_NAMES,
  assignmentListName,
  valueListAssignmentName,
} from "./variableDefinitionNames";

/** The answer for a name declared once in the root frame's own scope: its
 *  binding there is the only one the document makes, which a function binds
 *  by name (`RootBinding`). */
export const ROOT_ONLY = "only";

/** A `local` of the root frame's own scope: where its name is written, from
 *  where code reads it (the end of its statement), and the flow whose body
 *  declares it, -1 for the top level. */
interface RootDeclaration {
  at: number;
  visibleFrom: number;
  flow: number;
}

/** A scene or a branch: where its header starts and its `end` ends, and the
 *  flow its body is written in, -1 for the top level. */
interface Flow {
  from: number;
  to: number;
  parent: number;
}

/**
 * The `local`s a document declares in the root frame's own scope, which a
 * function written at the top level or in a scene reads as Luau reads an
 * upvalue (I-1374, I-1365). The top level and the bodies of its scenes and
 * branches share that scope: a scene opens no scope of its own, so its
 * `local` declares in the same scope as the top level's, and replaces a
 * binding of its name there while it runs. A block's local (an `if`, a
 * loop, a `do`) is in a scope of its own and is not one of them.
 *
 * A scene's body is written at the top level up to its `end`, so the flows
 * are followed as `topLevelStatements` follows them.
 *
 * Each declaration is known by its ordinal among the document's declarations
 * of its name: a name declared once is `ROOT_ONLY`, and the binding of each
 * declaration of a name declared more than once is kept under a slot of its
 * own (`rootSlotName`), which the declarations after it leave in place.
 */
export class RootLocals {
  protected readonly declarations = new Map<string, RootDeclaration[]>();
  protected readonly flows: Flow[] = [];

  constructor(top: SyntaxNode, read: (from: number, to: number) => string) {
    const open: number[] = [];
    for (let node = top.firstChild; node; node = node.nextSibling) {
      if (FLOWS.has(node.name)) {
        this.flows.push({
          from: node.from,
          to: Number.POSITIVE_INFINITY,
          parent: open[open.length - 1] ?? -1,
        });
        open.push(this.flows.length - 1);
      } else if (node.name === "LuauEndKeyword") {
        const flow = open.pop();
        if (flow !== undefined) this.flows[flow]!.to = node.to;
      } else {
        this.collect(node, open[open.length - 1] ?? -1, read);
      }
    }
  }

  /**
   * The declaration of `name` a function reads where code at `at` is
   * written: the last one before it at the top level or in a flow whose body
   * holds it. `ROOT_ONLY` for the document's only declaration of the name,
   * its ordinal (from 1) for one of several, and "" for none, where the name
   * reads the global, or the builtin of a stdlib name.
   */
  answer(name: string, at: number): string {
    const list = this.declarations.get(name);
    if (!list) return "";
    const around = this.flowsAround(at);
    for (let i = list.length - 1; i >= 0; i--) {
      const declaration = list[i]!;
      if (
        declaration.visibleFrom <= at &&
        (declaration.flow < 0 || around.has(declaration.flow))
      ) {
        return list.length === 1 ? ROOT_ONLY : String(i + 1);
      }
    }
    return "";
  }

  /** What the declaration of `name` written at `at` is known by, as `answer`
   *  gives it, or "" when no declaration of the root frame's scope is
   *  written there. */
  declared(name: string, at: number): string {
    const list = this.declarations.get(name);
    if (!list) return "";
    const i = list.findIndex((declaration) => declaration.at === at);
    if (i < 0) return "";
    return list.length === 1 ? ROOT_ONLY : String(i + 1);
  }

  /** The flows whose bodies hold `at`, innermost first. */
  protected flowsAround(at: number): Set<number> {
    const around = new Set<number>();
    let lo = 0;
    let hi = this.flows.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.flows[mid]!.from <= at) {
        last = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    for (let flow = last; flow >= 0; flow = this.flows[flow]!.parent) {
      if (at <= this.flows[flow]!.to) around.add(flow);
    }
    return around;
  }

  protected add(name: string, declaration: RootDeclaration): void {
    const list = this.declarations.get(name);
    if (list) {
      list.push(declaration);
    } else {
      this.declarations.set(name, [declaration]);
    }
  }

  /** The `local`s a statement of the top level or of a flow's body declares:
   *  a `local` declaration's names, and those of the statements a `&` line
   *  marks. A `local function` there is a function of the story, as a
   *  `function` is, and binds no local. */
  protected collect(
    node: SyntaxNode,
    flow: number,
    read: (from: number, to: number) => string,
  ): void {
    if (EXPLICIT.has(node.name)) {
      const content = childEndingWith(node, "_content");
      for (const statement of content ? statementsOf(content) : []) {
        this.collect(statement, flow, read);
      }
      return;
    }
    if (!VARIABLE_DEFINITION_NAMES.has(node.name)) return;
    if (scopeOf(node, read) !== "local") return;
    for (let content = node.firstChild; content; content = content.nextSibling) {
      if (!VARIABLE_DEFINITION_CONTENT_NAMES.has(content.name)) continue;
      for (let inner = content.firstChild; inner; inner = inner.nextSibling) {
        // A value in the list (`x` in `local a, b = 1, x`) declares nothing.
        if (
          !isExplicitRuleName(inner.name, "LuauVariableAssignment") ||
          valueListAssignmentName(inner)
        ) {
          continue;
        }
        const nameNode = assignmentListName(inner);
        if (nameNode) {
          this.add(read(nameNode.from, nameNode.to).trim(), {
            at: nameNode.from,
            visibleFrom: node.to,
            flow,
          });
        }
      }
    }
  }
}
