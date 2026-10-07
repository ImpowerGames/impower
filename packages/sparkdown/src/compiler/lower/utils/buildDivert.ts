import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { lowerExpressionFromNodes } from "../expression/lowerExpression";
import type { LowerContext } from "../context";
import { buildDisplayCall } from "./displayCall";
import { divertPartIdentifier, lowerDivertPath } from "./lowerDivertPath";

const CALL_NAMES = ["LuauFunctionCall", "LuauSparkdownExplicitFunctionCall"];
const PARAMETER_NAMES = [
  "DivertArguments",
  "LuauFunctionCallParameters",
  "LuauSparkdownExplicitFunctionCallParameters",
];

/** The direct children of a begin/content/end node's `_content` wrapper
 *  that hold text; none when the node matched no content. */
function contentChildren(node: SyntaxNode): SyntaxNode[] {
  const contentName = `${node.name}_content`;
  let scan = node.firstChild;
  while (scan && scan.name !== contentName) {
    scan = scan.nextSibling;
  }
  const children: SyntaxNode[] = [];
  let child = scan?.firstChild ?? null;
  while (child) {
    if (child.to > child.from) {
      children.push(child);
    }
    child = child.nextSibling;
  }
  return children;
}

/** What a `DivertTarget` names and passes, read from its own children so
 *  that a call or a divert path inside an argument (`-> a.b(f(x), -> c)`)
 *  is never taken for the target's. A relative call (`-> b(x)`) is a
 *  `LuauFunctionCall`; a dotted one (`-> a.b(x)`) is a `DivertPath`
 *  followed by its argument list. `extra` is whatever follows the one
 *  argument list the divert passes: a second list (`-> a.b(x)(y)`), a
 *  call's string or table argument (`-> b"x"`), or a path after a call
 *  (`-> b(x).c`). */
function readDivertTarget(targetNode: SyntaxNode): {
  nameNode: SyntaxNode | null;
  pathNode: SyntaxNode | null;
  params: SyntaxNode | null;
  extra: SyntaxNode[];
} {
  let nameNode: SyntaxNode | null = null;
  let pathNode: SyntaxNode | null = null;
  let params: SyntaxNode | null = null;
  const extra: SyntaxNode[] = [];
  for (const child of contentChildren(targetNode)) {
    if (
      child.name === "Annotation" ||
      child.name === "Tags" ||
      child.name === "ExtraWhitespace"
    ) {
      continue;
    }
    if (!nameNode && !pathNode && CALL_NAMES.includes(child.name)) {
      nameNode = getDescendent("LuauFunctionName", child) ?? null;
      for (const part of contentChildren(child)) {
        if (!params && PARAMETER_NAMES.includes(part.name)) {
          params = part;
        } else if (part.name !== "ExtraWhitespace") {
          extra.push(part);
        }
      }
      continue;
    }
    if (!nameNode && !pathNode && child.name === "DivertPath") {
      pathNode = child;
      continue;
    }
    if (pathNode && !params && PARAMETER_NAMES.includes(child.name)) {
      params = child;
      continue;
    }
    extra.push(child);
  }
  return { nameNode, pathNode, params, extra };
}

/** Lower an argument list's expressions, grouping the nodes between
 *  commas into one argument each. Mirrors how function-call arguments are
 *  lowered elsewhere (e.g. `lowerTable`). */
function lowerDivertArguments(params: SyntaxNode, ctx: LowerContext): Expression[] {
  const args: Expression[] = [];
  const content = getDescendent(
    PARAMETER_NAMES.map((name) => `${name}_content`),
    params,
  );
  if (!content) {
    return args;
  }
  let group: SyntaxNode[] = [];
  const flush = () => {
    if (group.length > 0) {
      const expr = lowerExpressionFromNodes(group, ctx);
      if (expr) args.push(expr);
      group = [];
    }
  };
  let arg = content.firstChild;
  while (arg) {
    if (arg.name === "LuauCommaSeparator") {
      flush();
    } else if (arg.name === "DivertArgumentsUnknown") {
      // A run of characters no argument rule reads (`(1; 2)`) is reported
      // once and ends the argument before it.
      flush();
      const from = arg.from;
      while (arg.nextSibling?.name === "DivertArgumentsUnknown") {
        arg = arg.nextSibling;
      }
      reportTargetError(
        `Unexpected \`${ctx.read(from, arg.to)}\` in this divert's arguments.`,
        from,
        arg.to,
        ctx,
      );
    } else {
      group.push(arg);
    }
    arg = arg.nextSibling;
  }
  flush();
  return args;
}

function reportTargetError(
  message: string,
  from: number,
  to: number,
  ctx: LowerContext,
): void {
  ctx.diagnostics?.push({
    message,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(from) + 1,
      endLineNumber: ctx.lineNumber(to) + 1,
      startCharacterNumber: ctx.characterNumber(from) + 1,
      endCharacterNumber: ctx.characterNumber(to) + 1,
    },
  });
}

/** Where an argument list's text starts: its `(`, after any space its
 *  `DivertArguments` begin took. */
function argumentListStart(params: SyntaxNode): number {
  return getDescendent("PunctuationParenOpen", params)?.from ?? params.from;
}

/** Report the text a divert target holds after the one argument list it
 *  passes, which the divert would otherwise drop without a word. */
function reportExtraTargetText(extra: SyntaxNode[], ctx: LowerContext): void {
  if (extra.length === 0) {
    return;
  }
  const first = extra[0]!;
  const isList = PARAMETER_NAMES.includes(first.name);
  const from = isList ? argumentListStart(first) : first.from;
  const to = extra[extra.length - 1]!.to;
  // value-level: the text is quoted in the message whole, never classified.
  const text = ctx.read(from, to).trim();
  reportTargetError(
    isList
      ? `A divert passes one argument list; \`${text}\` is not passed.`
      : `Unexpected \`${text}\` after this divert's target.`,
    from,
    to,
    ctx,
  );
}

/** Report a dotted target's argument list that its line ends before it is
 *  closed (`-> a.b(x`): `DivertArguments` ends with the line, so its end
 *  matched no `)`. */
function reportUnclosedArguments(params: SyntaxNode, ctx: LowerContext): void {
  const end = params.lastChild;
  if (params.name !== "DivertArguments" || !end || end.to > end.from) {
    return;
  }
  reportTargetError(
    "Expected `)` to close this divert's arguments.",
    argumentListStart(params),
    params.to,
    ctx,
  );
}

// Lower a `DivertTarget`, relative (`-> X(arg)`) or dotted
// (`-> X.Y(arg)`). Returns the path identifiers and any lowered args.
function lowerTargetWithArgs(
  targetNode: SyntaxNode,
  ctx: LowerContext,
): { path: Identifier[]; args: Expression[] } {
  const { nameNode, pathNode, params, extra } = readDivertTarget(targetNode);
  if (params) {
    reportUnclosedArguments(params, ctx);
  }
  reportExtraTargetText(extra, ctx);
  const path = nameNode
    ? [divertPartIdentifier(nameNode, ctx)]
    : pathNode
      ? lowerDivertPath(pathNode, ctx)
      : [];
  return { path, args: params ? lowerDivertArguments(params, ctx) : [] };
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
  // The directive is the text of its own `display({ text })` call on the
  // default target, whose closing newline ends its step.
  const directive = buildDisplayCall(
    undefined,
    undefined,
    [new Text(`[[load ${name}]]`)],
    divertNode,
    ctx,
  );
  return [...lead, directive, ...objects];
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
  const { nameNode, pathNode } = readDivertTarget(targetNode);
  if (nameNode) {
    return ctx.read(nameNode.from, nameNode.to);
  }
  const first = pathNode ? getDescendent("DivertPartName", pathNode) : null;
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
    // An alternator arm's divert chains `ArmTunnel` nodes instead.
    const nextTunnel: SyntaxNode | null =
      directChild(cursor, "Tunnel") ?? directChild(cursor, "ArmTunnel");
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
