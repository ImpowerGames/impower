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
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  containerValueNodes,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import type { LowerContext } from "../context";
import { buildDisplayCall } from "./displayCall";
import { divertPartIdentifier, lowerDivertPath } from "./lowerDivertPath";

const CALL_NAMES = nodeNameSet(["LuauFunctionCall"]);
const PARAMETER_NAMES = nodeNameSet([
  "DivertArguments",
  "LuauFunctionCallParameters",
]);

function contentChildren(node: SyntaxNode): SyntaxNode[] {
  return containerValueNodes(node).filter((child) => child.to > child.from);
}

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
    if (!nameNode && !pathNode && CALL_NAMES.has(child.name)) {
      nameNode = getDescendent("LuauFunctionName", child) ?? null;
      for (const part of contentChildren(child)) {
        if (!params && PARAMETER_NAMES.has(part.name)) {
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
    if (pathNode && !params && PARAMETER_NAMES.has(child.name)) {
      params = child;
      continue;
    }
    extra.push(child);
  }
  return { nameNode, pathNode, params, extra };
}

function lowerDivertArguments(params: SyntaxNode, ctx: LowerContext): Expression[] {
  const args: Expression[] = [];
  const content = getDescendent(
    [...PARAMETER_NAMES].map((name) => `${name}_content`),
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

function argumentListStart(params: SyntaxNode): number {
  return getDescendent("PunctuationParenOpen", params)?.from ?? params.from;
}

function reportExtraTargetText(extra: SyntaxNode[], ctx: LowerContext): void {
  if (extra.length === 0) {
    return;
  }
  const first = extra[0]!;
  const isList = PARAMETER_NAMES.has(first.name);
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

function lowerTargetWithArgs(
  targetNode: SyntaxNode,
  ctx: LowerContext,
): { path: Identifier[]; args: Expression[] } {
  const { nameNode, pathNode, params, extra } = readDivertTarget(targetNode);
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
  const lead = options.ownLine === false ? [new Text("\n")] : [];
  const directive = buildDisplayCall(
    undefined,
    undefined,
    [new Text(`[[load ${name}]]`)],
    divertNode,
    ctx,
  );
  return [...lead, directive, ...objects];
}

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

function loadTargetName(targetNode: SyntaxNode, ctx: LowerContext): string {
  const { nameNode, pathNode } = readDivertTarget(targetNode);
  if (nameNode) {
    return ctx.read(nameNode.from, nameNode.to);
  }
  const first = pathNode ? getDescendent("DivertPartName", pathNode) : null;
  return first ? ctx.read(first.from, first.to) : "";
}

export function buildDivert(
  divertNode: SyntaxNode,
  ctx: LowerContext,
  options: BuildDivertOptions = {},
): DivertLike[] {
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

  if (options.isThread) {
    const target = getDescendent("DivertTarget", divertNode);
    if (!target) return [];
    const { path, args } = lowerTargetWithArgs(target, ctx);
    if (path.length === 0) return [];
    const divert = new Divert(path, args);
    divert.isThread = true;
    return [divert];
  }

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
    const isLastTarget = i === chain.targets.length - 1;
    if (!isLastTarget || chain.trailingArrows >= 1) {
      divert.isTunnel = true;
    }
    results.push(divert);
  }
  if (chain.trailingArrows >= 2) {
    results.push(new TunnelOnwards());
  }
  return results;
}

interface DivertChain {
  targets: SyntaxNode[];
  trailingArrows: number;
}

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
      trailingArrows++;
    }
    pastInitialMark = true;
    const nextTunnel: SyntaxNode | null =
      directChild(cursor, "Tunnel") ?? directChild(cursor, "ArmTunnel");
    if (!nextTunnel) break;
    cursor = nextTunnel;
  }
  return { targets, trailingArrows };
}

function directChild(parent: SyntaxNode, name: string): SyntaxNode | null {
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
