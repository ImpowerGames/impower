import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { lowerExpressionFromNodes } from "../expression/lowerExpression";
import { LowerContext } from "../context";
import { lowerDivertPath } from "./lowerDivertPath";

// Lower a `DivertTarget` that may include a `LuauFunctionCall` shape
// (`-> X(arg)`). Returns the path identifiers and any lowered args.
function lowerTargetWithArgs(
  targetNode: SyntaxNode,
  ctx: LowerContext,
): { path: Identifier[]; args: Expression[] } {
  const fnCall = getDescendent("LuauFunctionCall", targetNode);
  if (fnCall) {
    const nameNode = getDescendent("LuauFunctionName", fnCall);
    const path = nameNode
      ? [new Identifier(ctx.read(nameNode.from, nameNode.to))]
      : [];
    const args: Expression[] = [];
    const params = getDescendent("LuauFunctionCallParameters_content", fnCall);
    if (params) {
      // Group siblings between commas into per-argument node lists,
      // then lower each via `lowerExpressionFromNodes`. Mirrors how
      // function-call args are lowered elsewhere (e.g. `lowerTable`).
      let group: SyntaxNode[] = [];
      let arg = params.firstChild;
      while (arg) {
        if (arg.name === "LuauCommaSeparator") {
          if (group.length > 0) {
            const expr = lowerExpressionFromNodes(group, ctx);
            if (expr) args.push(expr);
            group = [];
          }
        } else {
          group.push(arg);
        }
        arg = arg.nextSibling;
      }
      if (group.length > 0) {
        const expr = lowerExpressionFromNodes(group, ctx);
        if (expr) args.push(expr);
      }
    }
    return { path, args };
  }
  return { path: lowerDivertPath(targetNode, ctx), args: [] };
}

export interface BuildDivertOptions {
  isThread?: boolean;
}

export type DivertLike = Divert | TunnelOnwards;

/**
 * The `load` keyword on an arrow (`-> load X`, `-> load X ->`, `<- load X`)
 * makes the story preload X's scene (and world) behind the loading layout
 * before following the arrow. It lowers to the `[[load X]]` directive on its
 * own line ahead of the arrow's objects, so the runtime treats every spelling
 * alike: a load beat, then the divert.
 *
 * Returns the objects with the directive prepended, or the objects unchanged
 * when the arrow carries no `load`. A tunnel-onwards or a multi-target chain
 * with `load` is left to the caller to diagnose; the directive still lowers so
 * the author's intent survives.
 */
export function withDivertLoad(
  divertNode: SyntaxNode,
  objects: DivertLike[],
  ctx: LowerContext,
  options: { ownLine?: boolean } = {},
): ParsedObject[] {
  if (!getDescendent("DivertLoadKeyword", divertNode)) {
    return objects;
  }
  const target = getDescendent("DivertTarget", divertNode);
  const name = target ? loadTargetName(target, ctx) : "";
  if (!name) {
    return objects;
  }
  // An arrow that shares its line with display text (a choice, a mid-line
  // divert) ends that line first, so the load runs as its own beat rather
  // than opening the loading layout over the line before it.
  const lead = options.ownLine === false ? [new Text("\n")] : [];
  return [...lead, new Text(`[[load ${name}]]`), new Text("\n"), ...objects];
}

/** Why a `load` on this arrow cannot mean what it says, or null when it can.
 *  `load` applies to the first target of a divert, a tunnel call, or a
 *  thread; a tunnel-onwards has no target to load, and a chain has several. */
export function divertLoadShapeProblem(divertNode: SyntaxNode): string | null {
  if (!getDescendent("DivertLoadKeyword", divertNode)) {
    return null;
  }
  if (getDescendent("TunnelMark", divertNode)) {
    return "`load` needs a target: `->->` returns rather than diverting.";
  }
  if (getDescendents(["DivertTarget"], divertNode).length > 1) {
    return "`load` applies to a single target; split the chain into separate arrows.";
  }
  return null;
}

/** The flow a `load` arrow names: the first component of its target path
 *  (`-> load Chapter2.intro` loads Chapter2), or a called flow's name. */
function loadTargetName(targetNode: SyntaxNode, ctx: LowerContext): string {
  const fnCall = getDescendent("LuauFunctionCall", targetNode);
  if (fnCall) {
    const nameNode = getDescendent("LuauFunctionName", fnCall);
    return nameNode ? ctx.read(nameNode.from, nameNode.to) : "";
  }
  const first = getDescendent("DivertPartName", targetNode);
  return first ? ctx.read(first.from, first.to) : "";
}

// Lowers a `Divert` syntax node into one or more ParsedObjects.
// Supports all of ink's divert/tunnel shapes:
//
//   `-> X`              → [ Divert(X) ]
//   `-> X ->`           → [ Divert(X, isTunnel=true) ]
//   `-> X -> Y`         → [ Divert(X, isTunnel=true), Divert(Y) ]
//   `-> X -> Y ->`      → [ Divert(X, isTunnel=true), Divert(Y, isTunnel=true) ]
//   `-> X -> Y -> Z`    → [ Divert(X, isTunnel=true), Divert(Y, isTunnel=true), Divert(Z) ]
//   `->->`              → [ TunnelOnwards() ]
//   `->-> X`            → [ TunnelOnwards(divertAfter=Divert(X)) ]
//   `-> X ->->`         → [ Divert(X, isTunnel=true), TunnelOnwards() ]
//
// Multi-target tunnels are chains of tunnel calls. Each non-final
// target is a tunnel (pushes a return frame), and the final target is
// either a tunnel (if there's a trailing `->`) or a plain divert. The
// runtime executes the diverts sequentially: each tunnel pushes a
// frame, the callee's `->->` pops it and continues with the next
// sibling, and so on. Mirrors upstream inkjs ink-parsing behavior.
//
// Returns an empty array if no valid form was found.
export function buildDivert(
  divertNode: SyntaxNode,
  ctx: LowerContext,
  options: BuildDivertOptions = {},
): DivertLike[] {
  // Tunnel-onwards form: the grammar's Divert begin captures `->->` as
  // a `TunnelMark` (vs the single-arrow `DivertMark`). Optional
  // trailing `DivertTarget` becomes `divertAfter` and may carry args
  // (`->-> X(5)`).
  if (getDescendent("TunnelMark", divertNode) && !options.isThread) {
    const onwards = new TunnelOnwards();
    const afterTarget = getDescendent("DivertTarget", divertNode);
    if (afterTarget) {
      const { path, args } = lowerTargetWithArgs(afterTarget, ctx);
      if (path.length > 0) {
        onwards.divertAfter = new Divert(path, args);
      }
    }
    return [onwards];
  }

  // Threads (`<- X`) — single-target only; no tunnel chaining.
  if (options.isThread) {
    const target = getDescendent("DivertTarget", divertNode);
    if (!target) return [];
    const { path, args } = lowerTargetWithArgs(target, ctx);
    if (path.length === 0) return [];
    const divert = new Divert(path, args);
    divert.isThread = true;
    return [divert];
  }

  // Collect the chain of targets plus the count of trailing `->`
  // arrows after the last target. The chain shape determines how
  // each target is lowered:
  //   targets=[X], trailing=0 → [Divert(X)]
  //   targets=[X], trailing=1 → [Divert(X, isTunnel=true)]
  //   targets=[X], trailing=2 → [Divert(X, isTunnel=true), TunnelOnwards()]
  //   targets=[X,Y], trailing=0 → [Divert(X, isTunnel=true), Divert(Y)]
  //   targets=[X,Y], trailing=1 → [Divert(X, isTunnel=true), Divert(Y, isTunnel=true)]
  //   targets=[X,Y], trailing=2 → [Divert(X, …), Divert(Y, …), TunnelOnwards()]
  const chain = collectDivertChain(divertNode);
  if (chain.targets.length === 0) {
    return [];
  }

  const results: DivertLike[] = [];
  for (let i = 0; i < chain.targets.length; i++) {
    const target = chain.targets[i]!;
    const { path, args } = lowerTargetWithArgs(target, ctx);
    if (path.length === 0) continue;
    const divert = new Divert(path, args);
    // A non-final target is always a tunnel (control returns here to
    // proceed to the next target). The final target is a tunnel iff
    // there's at least one trailing arrow.
    const isLastTarget = i === chain.targets.length - 1;
    if (!isLastTarget || chain.trailingArrows >= 1) {
      divert.isTunnel = true;
    }
    results.push(divert);
  }
  // Two trailing arrows means the line ends with `->->` after the
  // last tunnel call — emit a `TunnelOnwards` so the runtime pops the
  // outer caller's frame too after the last target returns.
  if (chain.trailingArrows >= 2) {
    results.push(new TunnelOnwards());
  }
  return results;
}

interface DivertChain {
  targets: SyntaxNode[];
  // Number of trailing `->` arrows after the last target. The grammar
  // captures each `->` as a separate (possibly target-less) Tunnel
  // node, so a `->->` after `X` shows up as two nested target-less
  // Tunnels. The counts that matter:
  //   0: plain divert (no trailing arrow)
  //   1: tunnel call (single trailing arrow)
  //   2: tunnel call + tunnel-onwards (`->->` after the last target)
  trailingArrows: number;
}

// Walks the Divert / nested-Tunnel chain in source order, collecting
// each `DivertTarget` node encountered, then counts how many further
// target-less Tunnels follow as trailing arrows. Resets the count to
// zero whenever a new target is encountered — those earlier arrows
// were internal (between targets), not trailing.
function collectDivertChain(divertNode: SyntaxNode): DivertChain {
  const targets: SyntaxNode[] = [];
  let trailingArrows = 0;
  let cursor: SyntaxNode | null = divertNode;
  let pastInitialMark = false;
  while (cursor) {
    const target = directChild(cursor, "DivertTarget");
    if (target) {
      targets.push(target);
      trailingArrows = 0;
    } else if (pastInitialMark) {
      // A nested Tunnel with no DivertTarget after the initial
      // Divert mark — this is a trailing arrow.
      trailingArrows++;
    }
    pastInitialMark = true;
    const nextTunnel = directChild(cursor, "Tunnel");
    if (!nextTunnel) break;
    cursor = nextTunnel;
  }
  return { targets, trailingArrows };
}

function directChild(parent: SyntaxNode, name: string): SyntaxNode | null {
  // Search through `_content` wrappers (begin/content/end shape) and
  // direct children. The Divert and Tunnel rules' DivertTarget /
  // Tunnel children live in their `_content` wrapper.
  const contentName = `${parent.name}_content`;
  let scan = parent.firstChild;
  while (scan) {
    if (scan.name === contentName) {
      let inner = scan.firstChild;
      while (inner) {
        if (inner.name === name) return inner;
        inner = inner.nextSibling;
      }
      return null;
    }
    if (scan.name === name) return scan;
    scan = scan.nextSibling;
  }
  return null;
}
