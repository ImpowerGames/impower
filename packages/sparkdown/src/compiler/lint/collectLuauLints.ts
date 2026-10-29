import { Tree, TreeBuffer, type NodeSet, type SyntaxNode } from "@lezer/common";
import { STDLIB, STDLIB_CONSTANTS } from "../../runtime/StdLib";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInterpString,
  AstExprLocal,
  AstExprSparkdownCallShorthand,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
  AstStatContinue,
  AstStatError,
  AstStatExpr,
  AstStatFor,
  AstStatForIn,
  AstStatFunction,
  AstStatIf,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatRepeat,
  AstStatReturn,
  AstStatWhile,
  AstTableAccess,
  AstType,
  AstTypePack,
  AstTypeReference,
  AstTypeTable,
  BinaryOp,
  QuoteStyle,
  binaryOpToString,
  TableItemKind,
  UnaryOp,
  getFunctionNameAsString,
  visitAst,
  type AstLocal,
  type AstNode,
} from "../typecheck/Ast";
import { doesCallError, getFallthrough } from "../typecheck/DataFlowGraph";
import { decodeBytes } from "../typecheck/Linter";
import type { Location, Position } from "../typecheck/Location";
import { readDocumentUnits } from "../typecheck/LuauDocumentChecker";
import { FLOW_HEADERS, NEUTRAL, RESERVED, isSparkdownExpression, SPARKDOWN_ONLY } from "../typecheck/LuauUnitNodes";
import { readLuauExpression, readLuauMethod, readLuauStatements, type LuauAstUnit } from "../typecheck/readLuauAst";
import { isExplicitRuleName } from "../utils/explicitRuleNames";
import { nodeNameSet } from "../utils/nodeNameSet";
import { numberLiteralValue } from "../utils/numberLiteralValue";
import { stringLiteralValue } from "../utils/stringLiteralValue";
import { lintFormatStringCall } from "./formatString";
import { collectNameFacts, isAuthoredLuauName, type LuauNameFacts, type LuauProgramNames, type NameRange, type NameRoot } from "./luauNames";
export { indexProgramNames } from "./luauNames";

export const LUAU_LINT_CODES = [
  "LocalUnused",
  "UnreachableCode",
  "DuplicateCondition",
  "ForRange",
  "PlaceholderRead",
  "BuiltinGlobalWrite",
  "LocalShadow",
  "FunctionUnused",
  "SameLineStatement",
  "MultiLineStatement",
  "UninitializedLocal",
  "UnbalancedAssignment",
  "DuplicateFunction",
  "DuplicateLocal",
  "GlobalUsedAsLocal",
  "TableLiteral",
  "TableOperations",
  "DeprecatedApi",
  "ImplicitReturn",
  "MisleadingAndOr",
  "IntegerParsing",
  "ComparisonPrecedence",
  "FormatString",
] as const;

export type LuauLintCode = (typeof LUAU_LINT_CODES)[number];

export interface LuauLint {
  code: LuauLintCode;
  from: number;
  to: number;
  message: string;
}

export interface LuauScriptLints {
  lints: LuauLint[];
  names: LuauNameFacts;
  roots: NameRoot[];
  globalShadows: GlobalShadowCandidate[];
  uncertainGlobalUses: ReadonlySet<number>;
  outermostLocals: ReadonlySet<string>;
  mentionsUnplaced: (name: string) => boolean;
  mentionsUnplacedVariable: (name: string) => boolean;
  misreadStatements: NameRange[];
  topLevelMembers: TopLevelMemberDefinition[];
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

class Offsets {
  constructor(
    private readonly starts: number[],
    private readonly lines: number[] | undefined,
  ) {}

  line(position: Position): number {
    return this.lines?.[position.line] ?? position.line;
  }

  of(position: Position): number {
    return (this.starts[this.line(position)] ?? 0) + position.column;
  }

  range(location: Location): { from: number; to: number } {
    return { from: this.of(location.begin), to: this.of(location.end) };
  }
}

function readToEnd(fn: AstNode): boolean {
  let complete = true;
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstStatBlock && !node.hasEnd) complete = false;
      return complete;
    },
  });
  return complete;
}

function completeFunctions(root: AstNode, functions: AstExprFunction[]): void {
  let inType = false;
  const visitor = {
    visit(node: AstNode): boolean {
      if ((node instanceof AstType || node instanceof AstTypePack) && !inType) {
        inType = true;
        visitAst(node, visitor);
        inType = false;
        return false;
      }
      if (!(node instanceof AstExprFunction)) return true;
      if (readToEnd(node)) {
        functions.push(node);
        if (inType) typeOnly.add(node);
      }
      return false;
    },
  };
  visitAst(root, visitor);
}

const typeOnly = new WeakSet<AstExprFunction>();

function definedFunctions(unit: LuauAstUnit): AstExprFunction[] {
  const functions: AstExprFunction[] = [];
  for (const source of unit.statements) completeFunctions(source.statement, functions);
  return functions;
}

const LINTED_NODES = nodeNameSet(["LuauLogicalOperator", "LuauCompareOperator", "LuauTernaryExpression", "LuauFunctionDefinition", "LuauMethodDefinition", "LuauIfBlock", "LuauForLoop", "LuauSparkdownExplicitIfBlock", "LuauSparkdownExplicitLoop", "LuauAccessPath", "LuauChainedFunctionCall", "LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary", "LuauSparkleHandlerClosure"]);
const lintNodeTypes = new WeakMap<NodeSet, Uint8Array>();

function lintSyntaxNodes(tree: Tree, text: string): SyntaxNode[] {
  const found: { name: string; from: number; to: number }[] = [];
  const flags = (name: string) => (LINTED_NODES.has(name) || name === "LuauIfKeyword" ? 1 : 0) | (name.startsWith("Luau") && name.endsWith("Keyword") ? 2 : 0);
  const eligible = (bits: number, from: number, to: number) => {
    if (bits & 1) return true;
    if (!(bits & 2)) return false;
    const name = text.slice(from, to);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name);
  };
  const scan = (part: Tree | TreeBuffer, offset: number): void => {
    if (part instanceof TreeBuffer) {
      const buffer = part.buffer;
      let types = lintNodeTypes.get(part.set);
      if (!types) {
        types = Uint8Array.from(part.set.types, (type) => flags(type.name));
        lintNodeTypes.set(part.set, types);
      }
      for (let i = 0; i < buffer.length; i += 4) {
        const bits = types[buffer[i]!]!;
        if (!bits) continue;
        const from = offset + buffer[i + 1]!;
        const to = offset + buffer[i + 2]!;
        if (eligible(bits, from, to)) found.push({ name: part.set.types[buffer[i]!]!.name, from, to });
      }
    } else {
      if (eligible(flags(part.type.name), offset, offset + part.length)) found.push({ name: part.type.name, from: offset, to: offset + part.length });
      for (let i = 0; i < part.children.length; i++) scan(part.children[i]!, offset + part.positions[i]!);
    }
  };
  scan(tree, 0);
  return found.map(({ name, from, to }) => {
    let node = tree.resolveInner(from, 1);
    while (node.parent && (node.name !== name || node.from !== from || node.to !== to)) node = node.parent;
    if (node.name !== name || node.from !== from || node.to !== to) throw new Error(`Cannot resolve lint node ${name} at ${from}:${to}`);
    return node;
  });
}

function uncertainNames(nodes: SyntaxNode[], text: string, facts: LuauNameFacts): LuauNameFacts["uncertainNames"] {
  const key = (range: { from: number; to: number }) => `${range.from}:${range.to}`;
  const represented = new Set([...facts.declarations, ...facts.references, ...facts.globals, ...facts.functions].map(key));
  const found: LuauNameFacts["uncertainNames"] = [];
  for (const node of nodes) {
    if (!node.name.startsWith("Luau") || !node.name.endsWith("Keyword") || represented.has(key(node))) continue;
    const name = text.slice(node.from, node.to);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || RESERVED.has(name)) continue;
    found.push({ name, from: node.from, to: node.to, reason: "grammar-keyword" });
    represented.add(key(node));
  }
  return found.sort((a, b) => a.from - b.from || a.to - b.to);
}

function unplacedMention(tree: Tree, text: string, placed: ReadonlySet<number>, definitions: ReadonlySet<number>, misread: boolean, name: string): boolean {
  const word = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, "g");
  for (const match of text.matchAll(word)) {
    if (definitions.has(match.index) || (!misread && placed.has(match.index))) continue;
    const node = tree.resolveInner(match.index, 1);
    if (node.name.includes("Comment")) continue;
    if (misread || node.name.startsWith("Luau") || node.name.startsWith("Divert")) return true;
    if (node.name === "Word" && node.parent?.name.startsWith("Luau") && node.parent.name.includes("String")) return true;
  }
  return false;
}

function fieldNames(roots: NameRoot[]): Set<number> {
  const found = new Set<number>();
  for (const { root, offsets } of roots) {
    visitAst(root, {
      visit(node) {
        if (node instanceof AstExprIndexName) {
          let receiver = node.expr;
          while (receiver instanceof AstExprGroup || receiver instanceof AstExprTypeAssertion) receiver = receiver.expr;
          if (!(receiver instanceof AstExprGlobal && receiver.name === "_G")) found.add(offsets.range(node.indexLocation).from);
        } else if (node instanceof AstExprTable) {
          for (const item of node.items) if (item.kind === TableItemKind.Record && item.key) found.add(offsets.range(item.key.location).from);
        } else if (node instanceof AstTypeTable) for (const prop of node.props) found.add(offsets.range(prop.location).from);
        return true;
      },
    });
  }
  return found;
}

const OPERATION = /^Luau\w*Operation(_content)?$/;

const BEGIN_OR_END = /_(begin|end)(_c\d+)*$/;

function isOpaque(node: SyntaxNode): boolean {
  if (SPARKDOWN_ONLY.has(node.name) || isSparkdownExpression(node)) return true;
  return !node.name.startsWith("Luau") && !NEUTRAL.test(node.name);
}

function endsExpression(node: SyntaxNode, text: string): boolean {
  if (isSparkdownExpression(node)) return false;
  if (isOpaque(node) || BEGIN_OR_END.test(node.name)) return true;
  if (/Keyword$|Separator$/.test(node.name) || node.name === "LuauAssignmentOperator") return true;
  return node.name.startsWith("Punctuation") && /[,;]/.test(text.slice(node.from, node.to));
}

function expressionAround(node: SyntaxNode, text: string): SyntaxNode[] {
  for (let parent = node.parent; parent && !isOpaque(parent); parent = parent.parent) {
    if (isExplicitRuleName(parent.name, "LuauTable")) {
      node = parent;
      break;
    }
  }
  let part = node;
  let list = node.parent;
  while (list && OPERATION.test(list.name) && !/^Luau(?:SparkdownExplicit)?AssignmentOperation/.test(list.name)) {
    part = list;
    list = list.parent;
  }
  if (!list) return [part];
  const children: SyntaxNode[] = [];
  for (let child = list.firstChild; child; child = child.nextSibling) children.push(child);
  const at = children.findIndex((child) => child.from === part.from && child.to === part.to && child.name === part.name);
  let first = at;
  let last = at;
  while (first > 0 && !endsExpression(children[first - 1]!, text)) first--;
  while (last < children.length - 1 && !endsExpression(children[last + 1]!, text)) last++;
  while (first < at && NEUTRAL.test(children[first]!.name)) first++;
  while (last > at && NEUTRAL.test(children[last]!.name)) last--;
  return children.slice(first, last + 1);
}

interface OutsideReading {
  expr: AstExpr;
  errors: readonly { location: Location }[];
  statements: boolean;
  method?: boolean;
}

function expressionsOutsideUnits(nodes: SyntaxNode[], text: string, units: LuauAstUnit[]): OutsideReading[] {
  const key = (node: { name: string; from: number; to: number }) => `${node.from}:${node.to}:${node.name}`;
  const statementNodes = new Set(units.flatMap((unit) => unit.statements.flatMap((source) => source.nodes.map(key))));
  const opaqueAbove = (node: SyntaxNode): SyntaxNode | null | undefined => {
    for (let at = node.parent; at; at = at.parent) {
      if (statementNodes.has(key(at))) return null;
      if (isOpaque(at)) return at;
    }
    return undefined;
  };
  interface Reading {
    from: number;
    to: number;
    context: number;
    read: () => OutsideReading;
  }
  const readings: Reading[] = [];
  for (const node of nodes) {
      if (!LINTED_NODES.has(node.name)) continue;
      if (statementNodes.has(key(node))) continue;
      const above = opaqueAbove(node);
      if (above === null) continue;
      const context = above ? above.from : -1;
      const method = node.parent?.name === "LuauDefine_content";
      if (node.name === "LuauMethodDefinition") {
        readings.push({ from: node.from, to: node.to, context, read: () => ({ ...readLuauMethod(node, text), statements: false, method }) });
      } else if (node.name === "LuauSparkleHandlerClosure") {
        const content = node.getChild("LuauSparkleHandlerClosure_content");
        if (content) readings.push({ from: node.from, to: node.to, context, read: () => ({ ...readLuauStatements([content], text), statements: true }) });
      } else if (node.name === "LuauIfBlock" || node.name === "LuauForLoop" || node.name === "LuauSparkdownExplicitIfBlock" || node.name === "LuauSparkdownExplicitLoop") {
        readings.push({ from: node.from, to: node.to, context, read: () => ({ ...readLuauStatements([node], text), statements: true }) });
      } else {
        const parts = isExplicitRuleName(node.name, "LuauLogicalOperator") || isExplicitRuleName(node.name, "LuauCompareOperator") || isExplicitRuleName(node.name, "LuauAccessPath") || isExplicitRuleName(node.name, "LuauChainedFunctionCall") || node.name.startsWith("LuauNumeric") ? expressionAround(node, text) : [node];
        const first = parts[0]!;
        const last = parts[parts.length - 1]!;
        readings.push({ from: first.from, to: last.to, context, read: () => ({ ...readLuauExpression(parts, text), statements: false, method }) });
      }
  }
  readings.sort((a, b) => a.from - b.from || b.to - a.to);
  const kept: Reading[] = [];
  for (const reading of readings) {
    const inside = kept.some((outer) => outer.from <= reading.from && reading.to <= outer.to && reading.context <= outer.from);
    if (!inside) kept.push(reading);
  }
  return kept.map((reading) => reading.read());
}

function narrativeIfStarts(nodes: SyntaxNode[]): Set<number> {
  const starts = new Set<number>();
  for (const node of nodes) {
      if (node.name !== "LuauIfKeyword") continue;
      let parent = node.parent;
      while (parent?.name.startsWith("LuauSparkdownIfBlock_begin")) parent = parent.parent;
      if (parent?.name === "LuauSparkdownIfBlock") starts.add(node.from);
  }
  return starts;
}

const enum Exit {
  None = 0,
  Continue = 1,
  Break = 2,
  Return = 3,
  Error = 4,
}

const EXIT_REASON: Record<Exit, string> = {
  [Exit.None]: "",
  [Exit.Continue]: "continues",
  [Exit.Break]: "breaks",
  [Exit.Return]: "returns",
  [Exit.Error]: "errors",
};

function lintUnreachable(fn: AstExprFunction, offsets: Offsets, out: LuauLint[]): void {
  const travel = (stat: AstStat): Exit => {
    if (stat instanceof AstStatIf) {
      const thenExit = travel(stat.thenbody);
      const elseExit = stat.elsebody ? travel(stat.elsebody) : Exit.None;
      return Math.min(thenExit, elseExit);
    }
    if (stat instanceof AstStatBlock) {
      for (let i = 0; i < stat.body.length; i++) {
        const si = stat.body[i]!;
        const step = travel(si);
        if (step === Exit.None) continue;
        if (step === Exit.Error && si instanceof AstStatExpr && si.expr instanceof AstExprCall && i + 1 === stat.body.length - 1 && stat.body[i + 1] instanceof AstStatReturn) {
          return step;
        }
        const next = stat.body[i + 1];
        if (next && !(next instanceof AstStatError)) {
          out.push({ code: "UnreachableCode", ...offsets.range(next.location), message: `Unreachable code (previous statement always ${EXIT_REASON[step]})` });
        }
        return step;
      }
      return Exit.None;
    }
    if (stat instanceof AstStatBreak) return Exit.Break;
    if (stat instanceof AstStatContinue) return Exit.Continue;
    if (stat instanceof AstStatReturn) return Exit.Return;
    if (stat instanceof AstStatExpr) return stat.expr instanceof AstExprCall && doesCallError(stat.expr) ? Exit.Error : Exit.None;
    if (stat instanceof AstStatWhile || stat instanceof AstStatRepeat || stat instanceof AstStatFor || stat instanceof AstStatForIn) {
      travel(stat.body);
      return Exit.None;
    }
    return Exit.None;
  };
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstExprFunction) travel(node.body);
      return true;
    },
  });
}

function alwaysTrue(expr: AstExpr): boolean {
  return (expr instanceof AstExprConstantBool && expr.value) || expr instanceof AstExprConstantNumber || expr instanceof AstExprConstantString;
}

function lintImplicitReturns(fn: AstExprFunction, offsets: Offsets, out: LuauLint[]): void {
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprFunction)) return true;
      let valueReturn: AstStatReturn | undefined;
      visitAst(node.body, {
        visit(child) {
          if (valueReturn || child instanceof AstExpr || child instanceof AstType || child instanceof AstTypePack) return false;
          if (child instanceof AstStatReturn && child.list.length) valueReturn = child;
          return true;
        },
      });
      const end = valueReturn && getFallthrough(node.body, alwaysTrue);
      if (!valueReturn || !end) return true;
      const range = offsets.range(end.location);
      const { begin, end: last } = end.location;
      if (!(end instanceof AstStatExpr || end instanceof AstStatAssign || end instanceof AstStatLocal) && begin.line !== last.line) {
        range.from = range.to - Math.min(3, last.column);
      }
      const name = node.debugname ? ` '${node.debugname}'` : "";
      out.push({ code: "ImplicitReturn", ...range, message: `Function${name} can implicitly return no values even though there's an explicit return at line ${offsets.line(valueReturn.location.begin) + 1}; add explicit return to silence` });
      return true;
    },
  });
}

function lintUnusedLocals(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[], broken: boolean, methods: readonly { expr: AstExpr; offsets: Offsets }[] = []): void {
  const declared: AstLocal[] = [];
  const localFunctions: AstLocal[] = [];
  const used = new Set<AstLocal>();
  const typeNames: { name: string; at: number }[] = [];
  const methodReads: { name: string; at: number }[] = [];
  const bindings: { local: AstLocal; from: number; to: number }[] = [];
  const blocks: { block: AstStatBlock; from: number; to: number }[] = [];
  const repeatEnds = new Map<AstStatBlock, number>();
  const declaredStatements: { stat: AstStat; locals: AstLocal[]; from: number; offsets: Offsets }[] = [];
  const read = (root: AstNode, offsets: Offsets, own: boolean) => {
    const bindBody = (locals: AstLocal[], body: AstStatBlock) => {
      for (const local of locals) bindings.push({ local, from: offsets.of(body.location.begin), to: offsets.of(body.location.end) });
    };
    visitAst(root, {
      visit(node) {
        if (node instanceof AstStatBlock) blocks.push({ block: node, from: offsets.of(node.location.begin), to: offsets.of(node.location.end) });
        if (node instanceof AstStatRepeat) repeatEnds.set(node.body, offsets.of(node.location.end));
        if (node instanceof AstExprFunction) bindBody([...(node.self ? [node.self] : []), ...node.args], node.body);
        else if (node instanceof AstStatFor) bindBody([node.variable], node.body);
        else if (node instanceof AstStatForIn) bindBody(node.vars, node.body);
        else if (node instanceof AstStatLocalFunction) {
          if (own) localFunctions.push(node.name);
          declaredStatements.push({ stat: node, locals: [node.name], from: offsets.of(node.func.body.location.begin), offsets });
        }
        if (node instanceof AstStatLocal) {
          if (own) declared.push(...node.vars);
          declaredStatements.push({ stat: node, locals: node.vars, from: offsets.of(node.location.end), offsets });
        } else if (node instanceof AstStatAssign) {
          for (const target of node.vars) if (!isLocalWrite(target) && !(target instanceof AstExprGlobal)) visitAst(target, this);
          for (const value of node.values) visitAst(value, this);
          return false;
        } else if (node instanceof AstExprLocal) {
          used.add(node.local);
        } else if (node instanceof AstExprGlobal) {
          if (!own && node.name !== "self") methodReads.push({ name: node.name, at: offsets.of(node.location.begin) });
        }
        else if (node instanceof AstTypeReference) {
          if (own) typeNames.push({ name: node.prefix ?? node.name, at: offsets.of(node.location.begin) });
        }
        return true;
      },
    });
  };
  read(fn, offsets, true);
  const fnFrom = offsets.of(fn.location.begin);
  const fnTo = offsets.of(fn.location.end);
  const methodRanges: { from: number; to: number }[] = [];
  for (const method of methods) {
    const range = method.offsets.range(method.expr.location);
    if (fnFrom <= range.from && range.to <= fnTo) {
      methodRanges.push(range);
      read(method.expr, method.offsets, false);
    }
  }
  for (const { stat, locals, from, offsets } of declaredStatements) {
    const at = offsets.of(stat.location.begin);
    let to = fnTo;
    let innermost = -1;
    for (const block of blocks) {
      if (block.from <= at && offsets.of(stat.location.end) <= block.to && block.from >= innermost) {
        innermost = block.from;
        to = repeatEnds.get(block.block) ?? block.to;
      }
    }
    for (const local of locals) bindings.push({ local, from, to });
  }
  const resolve = (name: string, at: number): AstLocal | undefined => {
    let found: { local: AstLocal; from: number } | undefined;
    for (const binding of bindings) {
      if (binding.local.name !== name || binding.from > at || at > binding.to) continue;
      if (!found || binding.from >= found.from) found = binding;
    }
    return found?.local;
  };
  for (const { name, at } of methodReads) {
    const local = resolve(name, at);
    if (local) used.add(local);
  }
  const names = new Set([...declared, ...localFunctions].map((local) => local.name));
  for (const { name, at } of typeNames) {
    const local = names.has(name) ? resolve(name, at) : undefined;
    if (local) used.add(local);
  }
  for (const { name, at } of keywordWords(tree, text, offsets.of(fn.location.begin), offsets.of(fn.location.end), names)) {
    if (name === "self" && methodRanges.some((range) => range.from <= at && at <= range.to)) continue;
    const local = resolve(name, at);
    if (local) used.add(local);
  }
  for (const local of declared) {
    if (!isAuthoredLuauName(local.name) || local.name.startsWith("_") || used.has(local)) continue;
    out.push({ code: "LocalUnused", ...offsets.range(local.location), message: `Variable '${local.name}' is never used; prefix with '_' to silence` });
  }
  if (broken) return;
  for (const local of localFunctions) {
    if (!isAuthoredLuauName(local.name) || local.name.startsWith("_") || used.has(local)) continue;
    out.push({ code: "FunctionUnused", ...offsets.range(local.location), message: functionUnusedMessage(local.name) });
  }
}

function functionUnusedMessage(name: string): string {
  return `Function '${name}' is never used; prefix with '_' to silence`;
}

function isLocalWrite(target: AstExpr): boolean {
  if (target instanceof AstExprLocal) return true;
  return target instanceof AstExprError && target.expressions.length === 1 && target.expressions[0] instanceof AstExprLocal;
}

function keywordWords(tree: Tree, text: string, from: number, to: number, names: Set<string>): { name: string; at: number }[] {
  const found: { name: string; at: number }[] = [];
  if (names.size === 0) return found;
  const word = /[A-Za-z_][A-Za-z0-9_]*/g;
  for (const match of text.slice(from, to).matchAll(word)) {
    if (!names.has(match[0])) continue;
    const at = from + match.index;
    if (tree.resolveInner(at, 1).name.endsWith("Keyword")) found.push({ name: match[0], at });
  }
  return found;
}

export interface GlobalShadowCandidate extends NameRange {
  name: string;
}

function lintLocalShadows(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[], globals: GlobalShadowCandidate[], published: (local: AstLocal) => boolean): void {
  const declared: AstLocal[] = [];
  const statementOf = new Map<AstLocal, AstNode>();
  const localFunctions = new Set<AstLocal>();
  const parameters = new Set<AstLocal>();
  const used = new Set<AstLocal>();
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstExprFunction) {
        const own = [...(node.self ? [node.self] : []), ...node.args];
        declared.push(...own);
        for (const local of own) parameters.add(local);
      } else if (node instanceof AstStatFor) declared.push(node.variable);
      else if (node instanceof AstStatForIn) declared.push(...node.vars);
      else if (node instanceof AstStatLocalFunction) {
        declared.push(node.name);
        localFunctions.add(node.name);
        statementOf.set(node.name, node);
      } else if (node instanceof AstStatLocal) {
        declared.push(...node.vars);
        for (const local of node.vars) statementOf.set(local, node);
      }
      if (node instanceof AstStatAssign) {
        for (const target of node.vars) if (!isLocalWrite(target)) visitAst(target, this);
        for (const value of node.values) visitAst(value, this);
        return false;
      }
      if (node instanceof AstExprLocal) used.add(node.local);
      return true;
    },
  });
  const names = new Set(declared.map((local) => local.name));
  const uncertain = new Set(keywordWords(tree, text, offsets.of(fn.location.begin), offsets.of(fn.location.end), names).map(({ name }) => name));
  for (const local of declared) {
    if (!used.has(local) || !isAuthoredLuauName(local.name) || local.name.startsWith("_") || uncertain.has(local.name)) continue;
    let shadow = local.shadow;
    while (shadow && published(shadow)) shadow = shadow.shadow;
    if (!shadow) {
      globals.push({ name: local.name, ...offsets.range(local.location) });
      continue;
    }
    if (shadow.functionDepth !== local.functionDepth) continue;
    if (localFunctions.has(local) && localFunctions.has(shadow)) continue;
    const recorded = statementOf.has(shadow) || parameters.has(shadow) || used.has(shadow);
    if (recorded && statementOf.get(local) === statementOf.get(shadow)) continue;
    out.push({ code: "LocalShadow", ...offsets.range(local.location), message: `Variable '${local.name}' shadows previous declaration at line ${offsets.line(shadow.location.begin) + 1}` });
  }
}

const BUILTIN_GLOBALS = new Set([...Object.keys(STDLIB), ...Object.keys(STDLIB_CONSTANTS)].map((name) => name.split(".")[0]!));

function flowParameters(tree: Tree, text: string, starts: Set<number>): { from: number; to: number; names: Set<string> }[] {
  const flows: { from: number; to: number; names: Set<string> }[] = [];
  const open: { from: number; to: number; names: Set<string> }[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === "LuauEndKeyword") {
      const closed = open.pop();
      if (closed) closed.to = node.to;
      continue;
    }
    if (!FLOW_HEADERS.has(node.name)) continue;
    const flow = { from: node.from, to: tree.length, names: new Set<string>() };
    tree.iterate({
      from: node.from,
      to: node.to,
      enter(inner) {
        if (!isExplicitRuleName(inner.name, "LuauFunctionParameter")) return true;
        flow.names.add(text.slice(inner.from, inner.to));
        starts.add(inner.from);
        return false;
      },
    });
    open.push(flow);
    if (flow.names.size) flows.push(flow);
  }
  return flows;
}

function uncertainGlobalUses(names: LuauNameFacts, outside: NameRange[], flows: { from: number; to: number; names: Set<string> }[], errors: NameRange[]): Set<number> {
  const uncertain = new Set<number>();
  const declarations = new Map<string, LuauNameFacts["declarations"]>();
  for (const declaration of names.declarations) {
    let list = declarations.get(declaration.name);
    if (!list) declarations.set(declaration.name, (list = []));
    list.push(declaration);
  }
  for (const reference of names.references) {
    if (reference.local) continue;
    const { name, from } = reference;
    if (errors.some((error) => error.from <= from && from < error.to)) uncertain.add(from);
    const reading = outside.find((range) => range.from <= from && from <= range.to);
    if (!reading) continue;
    if (flows.some((flow) => flow.from <= from && from < flow.to && flow.names.has(name))) uncertain.add(from);
    else if (declarations.get(name)?.some((d) => d.from <= from && from <= (d.scopeTo ?? Infinity) && !(reading.from <= d.from && d.from <= reading.to))) uncertain.add(from);
  }
  return uncertain;
}

function normalizedUri(uri: string): string {
  try {
    return new URL(uri).href;
  } catch {
    return uri;
  }
}

export interface GlobalShadowReference {
  uri: string;
  from: number;
}

export function lintGlobalShadows(
  program: LuauProgramNames,
  scripts: { uri: string; globalShadows: GlobalShadowCandidate[]; uncertainGlobalUses: ReadonlySet<number>; outermostLocals: ReadonlySet<string> }[],
  builtins: ReadonlySet<string>,
  message: (name: string, reference: GlobalShadowReference, own: boolean) => string,
): { uri: string; lint: LuauLint }[] {
  const found: { uri: string; lint: LuauLint }[] = [];
  const uncertain = new Map(scripts.map(({ uri, uncertainGlobalUses }) => [uri, uncertainGlobalUses]));
  const firsts = new Map<string, { own: Map<string, GlobalShadowReference>; any?: GlobalShadowReference & { key: string } }>();
  const firstOf = (name: string) => {
    let first = firsts.get(name);
    if (first) return first;
    first = { own: new Map() };
    firsts.set(name, first);
    const global = program.globals.get(name);
    if (!global || BUILTIN_GLOBALS.has(name) || builtins.has(name) || program.uncertainNames.has(name)) return first;
    if (scripts.some((script) => script.outermostLocals.has(name))) return first;
    for (const reference of [...global.reads, ...global.writes]) {
      if (uncertain.get(reference.uri)?.has(reference.from)) continue;
      const own = first.own.get(reference.uri);
      if (!own || reference.from < own.from) first.own.set(reference.uri, { uri: reference.uri, from: reference.from });
      const key = normalizedUri(reference.uri);
      if (!first.any || key < first.any.key || (key === first.any.key && reference.from < first.any.from)) first.any = { uri: reference.uri, from: reference.from, key };
    }
    return first;
  };
  for (const { uri, globalShadows } of scripts) {
    for (const candidate of globalShadows) {
      const first = firstOf(candidate.name);
      const own = first.own.get(uri);
      const reference = own ?? first.any;
      if (!reference) continue;
      found.push({ uri, lint: { code: "LocalShadow", from: candidate.from, to: candidate.to, message: message(candidate.name, reference, !!own) } });
    }
  }
  return found;
}

export function lintUnusedGlobalFunctions(program: LuauProgramNames, scripts: { uri: string; mentionsUnplaced: (name: string) => boolean; misreadStatements: NameRange[] }[], builtins: ReadonlySet<string>): { uri: string; lint: LuauLint }[] {
  const misreadIn = new Map(scripts.map(({ uri, misreadStatements }) => [uri, misreadStatements]));
  const definitions = new Map<string, (LuauProgramNames["functions"][number])[]>();
  const targets = new Set<AstNode>();
  for (const definition of program.functions) {
    if (definition.local || definition.receiver || definition.method || !(definition.target instanceof AstExprGlobal || definition.target instanceof AstExprLocal)) continue;
    targets.add(definition.target);
    let list = definitions.get(definition.name);
    if (!list) definitions.set(definition.name, (list = []));
    list.push(definition);
  }
  const misread = (definition: LuauProgramNames["functions"][number]) =>
    !!misreadIn.get(definition.uri)?.some((range) => range.from <= definition.from && definition.from < range.to);
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, list] of definitions) {
    if (name.startsWith("_") || builtins.has(name) || program.uncertainNames.has(name)) continue;
    const global = program.globals.get(name);
    if (global && [...global.reads, ...global.writes].some((reference) => !targets.has(reference.node))) continue;
    if (list.some(misread) || scripts.some((script) => script.mentionsUnplaced(name))) continue;
    const last = new Map<string, NameRange>();
    for (const { uri, from, to } of list) {
      const previous = last.get(uri);
      if (!previous || previous.from < from) last.set(uri, { from, to });
    }
    for (const [uri, range] of last) found.push({ uri, lint: { code: "FunctionUnused", ...range, message: functionUnusedMessage(name) } });
  }
  return found;
}

export function lintGlobalsUsedAsLocals(
  program: LuauProgramNames,
  scripts: { uri: string; uncertainGlobalUses: ReadonlySet<number>; outermostLocals: ReadonlySet<string>; mentionsUnplacedVariable: (name: string) => boolean; misreadStatements: NameRange[] }[],
  builtins: ReadonlySet<string>,
  line: (uri: string, offset: number) => number,
): { uri: string; lint: LuauLint }[] {
  const uncertain = new Map(scripts.map(({ uri, uncertainGlobalUses }) => [uri, uncertainGlobalUses]));
  const misreadIn = new Map(scripts.map(({ uri, misreadStatements }) => [uri, misreadStatements]));
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, global] of program.globals) {
    if (name === "_" || BUILTIN_GLOBALS.has(name) || builtins.has(name)) continue;
    if (!global.writes.some((reference) => reference.access === "write")) continue;
    if (global.definitions.some((definition) => definition.kind === "store" || definition.kind === "const")) continue;
    const references = [...new Set([...global.reads, ...global.writes])];
    let shared: readonly AstExprFunction[] | undefined;
    for (const { enclosingFunctions } of references) {
      if (!shared) shared = enclosingFunctions;
      else {
        let prefix = 0;
        while (prefix < shared.length && prefix < enclosingFunctions.length && shared[prefix] === enclosingFunctions[prefix]) prefix++;
        if (prefix < shared.length) shared = shared.slice(0, prefix);
      }
      if (!shared.length) break;
    }
    const top = shared?.[shared.length - 1];
    if (!top) {
      const readFirst = global.reads.some((reference) => !reference.enclosingFunctions.length || !reference.dominated);
      const writtenOutside = global.writes.some((reference) => !reference.enclosingFunctions.length);
      if (readFirst || writtenOutside) continue;
    }
    if (program.uncertainNames.has(name) || scripts.some((script) => script.outermostLocals.has(name))) continue;
    if (references.some((reference) => reference.inType || uncertain.get(reference.uri)?.has(reference.from) || misreadIn.get(reference.uri)?.some((range) => range.from <= reference.from && reference.from < range.to))) continue;
    if (scripts.some((script) => script.mentionsUnplacedVariable(name))) continue;
    let first = references[0]!;
    for (const reference of references) {
      const a = normalizedUri(reference.uri);
      const b = normalizedUri(first.uri);
      if (a < b || (a === b && reference.from < first.from)) first = reference;
    }
    let text = `Global '${name}' is never read before being written. Consider changing it to local`;
    if (top?.debugname) text = `Global '${name}' is only used in the enclosing function '${top.debugname}'; consider changing it to local`;
    else if (top) {
      const at = line(first.uri, program.scripts.get(first.uri)?.functionStarts.get(top) ?? first.from);
      text = `Global '${name}' is only used in the enclosing function defined at line ${at}; consider changing it to local`;
    }
    found.push({ uri: first.uri, lint: { code: "GlobalUsedAsLocal", from: first.from, to: first.to, message: text } });
  }
  return found;
}

function duplicateFunctionMessage(name: string, line: number): string {
  return `Duplicate function definition: '${name}' also defined on line ${line}`;
}

export interface TopLevelMemberDefinition extends NameRange {
  name: string;
}

function lintDuplicateFunctions(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], uncertain: readonly LuauNameFacts["uncertainNames"][number][], plainNamesCovered?: AstStatBlock): void {
  const complete = (stat: AstStat) => !errors.some((error) => stat.location.overlaps(error.location));
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstType || node instanceof AstTypePack || node instanceof AstStatError || node instanceof AstExprError) return false;
      if (node instanceof AstExprFunction && !readToEnd(node)) return false;
      if (node instanceof AstStat && !(node instanceof AstStatBlock) && !complete(node)) return false;
      if (!(node instanceof AstStatBlock)) return true;
      if (!node.hasEnd) return false;
      const block = offsets.range(node.location);
      const unsure = (name: string) => uncertain.some((occurrence) => occurrence.name === name && block.from <= occurrence.from && occurrence.to <= block.to);
      const first = new Map<string, Location>();
      for (const stat of node.body) {
        let name = "";
        let location: Location | undefined;
        if (stat instanceof AstStatFunction) {
          name = getFunctionNameAsString(stat.name) ?? "";
          location = stat.name.location;
          if (node === plainNamesCovered && !(stat.name instanceof AstExprIndexName)) continue;
        } else if (stat instanceof AstStatLocalFunction) {
          name = stat.name.name;
          location = stat.name.location;
          if (node === plainNamesCovered) continue;
        }
        if (!name || !location || !isAuthoredLuauName(name) || !complete(stat) || unsure(name.split(".")[0]!)) continue;
        const defined = first.get(name);
        if (!defined) first.set(name, location);
        else out.push({ code: "DuplicateFunction", ...offsets.range(location), message: duplicateFunctionMessage(name, offsets.line(defined.begin) + 1) });
      }
      return true;
    },
  };
  visitAst(root, visitor);
}

function topLevelMembers(names: LuauNameFacts, prelude: AstStatBlock, misread: readonly NameRange[]): TopLevelMemberDefinition[] {
  const found: TopLevelMemberDefinition[] = [];
  for (const definition of names.functions) {
    if (definition.scope !== prelude || !(definition.target instanceof AstExprIndexName)) continue;
    let receiver: AstExpr = definition.target;
    while (receiver instanceof AstExprIndexName) receiver = receiver.expr;
    const reference = names.references.find((candidate) => candidate.node === receiver);
    if (!reference || reference.local) continue;
    if (misread.some((range) => range.from <= definition.from && definition.from < range.to)) continue;
    found.push({ name: definition.name, from: definition.from, to: definition.to });
  }
  return found;
}

export interface DuplicateFunctionReference {
  uri: string;
  from: number;
}

export function lintDuplicateGlobalMembers(
  program: LuauProgramNames,
  scripts: { uri: string; topLevelMembers: readonly TopLevelMemberDefinition[] }[],
  message: (name: string, original: DuplicateFunctionReference) => string,
): { uri: string; lint: LuauLint }[] {
  const firsts = new Map<string, Map<string, TopLevelMemberDefinition>>();
  for (const { uri, topLevelMembers } of scripts) {
    for (const definition of topLevelMembers) {
      let byScript = firsts.get(definition.name);
      if (!byScript) firsts.set(definition.name, (byScript = new Map()));
      const own = byScript.get(uri);
      if (!own || definition.from < own.from) byScript.set(uri, definition);
    }
  }
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, byScript] of firsts) {
    if (byScript.size < 2 || program.uncertainNames.has(name.split(".")[0]!)) continue;
    const ordered = [...byScript].sort(([a, x], [b, y]) => (normalizedUri(a) < normalizedUri(b) ? -1 : normalizedUri(a) > normalizedUri(b) ? 1 : x.from - y.from));
    const [originalUri, original] = ordered[0]!;
    for (const [uri, definition] of ordered.slice(1)) {
      found.push({ uri, lint: { code: "DuplicateFunction", from: definition.from, to: definition.to, message: message(name, { uri: originalUri, from: original.from }) } });
    }
  }
  return found;
}

export function duplicateGlobalMemberMessage(name: string, line: number, path: string): string {
  return `${duplicateFunctionMessage(name, line)} in '${path}'`;
}

function lintPlaceholderReads(fn: AstExprFunction, offsets: Offsets, out: LuauLint[]): void {
  const isPlaceholder = (expr: AstExpr) => (expr instanceof AstExprLocal && expr.local.name === "_") || (expr instanceof AstExprGlobal && expr.name === "_");
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstStatAssign) {
        for (const target of node.vars) if (!isPlaceholder(target)) visitAst(target, this);
        for (const value of node.values) visitAst(value, this);
        return false;
      }
      if (node instanceof AstStatFunction) {
        if (!isPlaceholder(node.name)) visitAst(node.name, this);
        visitAst(node.func, this);
        return false;
      }
      if (node instanceof AstExpr && isPlaceholder(node)) {
        out.push({ code: "PlaceholderRead", ...offsets.range(node.location), message: "Placeholder value '_' is read here; consider using a named variable" });
      }
      return true;
    },
  });
}

function returnsMany(expr: AstExpr | undefined): boolean {
  return expr instanceof AstExprCall || expr instanceof AstExprVarargs;
}

function lintUninitializedLocals(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[], broken: boolean): void {
  if (broken) return;
  const locals = new Map<AstLocal, { defined: boolean; initialized: boolean; assigned: boolean; firstUse?: AstExprLocal }>();
  const local = (key: AstLocal) => {
    let found = locals.get(key);
    if (!found) locals.set(key, (found = { defined: false, initialized: false, assigned: false }));
    return found;
  };
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstStatLocal) {
        const many = returnsMany(node.values[node.values.length - 1]);
        node.vars.forEach((key, i) => {
          const found = local(key);
          found.defined = true;
          found.initialized = many || i < node.values.length;
        });
        return true;
      }
      if (node instanceof AstStatAssign) {
        for (const target of node.vars) assign(target);
        for (const value of node.values) visitAst(value, visitor);
        return false;
      }
      if (node instanceof AstStatFunction) {
        assign(node.name);
        visitAst(node.func, visitor);
        return false;
      }
      if (node instanceof AstExprLocal) {
        local(node.local).firstUse ??= node;
        return false;
      }
      return true;
    },
  };
  const assign = (target: AstExpr) => {
    if (!isLocalWrite(target)) return visitAst(target, visitor);
    const written = target instanceof AstExprError ? target.expressions[0] : target;
    if (written instanceof AstExprLocal) local(written.local).assigned = true;
  };
  visitAst(fn, visitor);
  const found = [...locals].filter(([key, l]) => l.defined && !l.initialized && !l.assigned && l.firstUse && isAuthoredLuauName(key.name));
  if (!found.length) return;
  const uncertain = new Set(keywordWords(tree, text, offsets.of(fn.location.begin), offsets.of(fn.location.end), new Set(found.map(([key]) => key.name))).map(({ name }) => name));
  for (const [key, { firstUse }] of found) {
    if (uncertain.has(key.name)) continue;
    out.push({ code: "UninitializedLocal", ...offsets.range(firstUse!.location), message: `Variable '${key.name}' defined at line ${offsets.line(key.location.begin) + 1} is never initialized or assigned; initialize with 'nil' to silence` });
  }
}

function lintUnbalancedAssignments(root: AstNode, text: string, offsets: Offsets, out: LuauLint[], unsure: (range: NameRange) => boolean): void {
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstStatLocal || node instanceof AstStatAssign)) return true;
      const vars = node.vars.length;
      const values = node.values.length;
      if (vars === values || values === 0) return true;
      const range = offsets.range(node.location);
      if (unsure(range) || /^store\b/.test(text.slice(range.from, range.from + 6))) return true;
      const last = node.values[values - 1];
      let message: string | undefined;
      if (vars < values) message = `Assigning ${values} values to ${vars} variables leaves some values unused`;
      else if (!returnsMany(last) && !(last instanceof AstExprConstantNil)) {
        message = `Assigning ${values} values to ${vars} variables initializes extra variables with nil; add 'nil' to value list to silence`;
      }
      if (message) out.push({ code: "UnbalancedAssignment", ...range, message });
      return true;
    },
  });
}

function lintDuplicateLocals(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], published: (local: AstLocal) => boolean, flowParameter: (offsets: Offsets, local: AstLocal) => boolean): void {
  const check = (owner: AstNode, inList: (location: Location) => boolean, declared: readonly AstLocal[], checked: readonly AstLocal[], kind: string, self?: AstLocal) => {
    const own = new Set(declared);
    for (const local of checked) {
      const shadow = local.shadow;
      if (!shadow || !own.has(shadow) || local.name === "_" || !isAuthoredLuauName(local.name) || published(local) || flowParameter(offsets, local)) continue;
      if (errors.some(({ location }) => location.end.ge(owner.location.begin) && inList(location))) return;
      const line = offsets.line(shadow.location.begin);
      const message =
        shadow === self ? "Function parameter 'self' already defined implicitly"
        : line === offsets.line(local.location.begin) ? `${kind} '${local.name}' already defined on column ${shadow.location.begin.column + 1}`
        : `${kind} '${local.name}' already defined on line ${line + 1}`;
      out.push({ code: "DuplicateLocal", ...offsets.range(local.location), message });
    }
  };
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstStatLocal) {
        const first = node.values[0]?.location.begin;
        check(node, (location) => (first ? location.begin.lt(first) : location.begin.line <= node.location.end.line), node.vars, node.vars, "Variable");
      } else if (node instanceof AstExprFunction && node.argLocation) {
        check(node, (location) => location.begin.lt(node.body.location.begin), [...(node.self ? [node.self] : []), ...node.args], node.args, "Function parameter", node.self);
      }
      return true;
    },
  });
}

function similar(a: AstExpr, b: AstExpr): boolean {
  if (a.kind !== b.kind) return false;
  if (a instanceof AstExprGroup && b instanceof AstExprGroup) return similar(a.expr, b.expr);
  if (a instanceof AstExprConstantNil) return true;
  if (a instanceof AstExprConstantBool && b instanceof AstExprConstantBool) return a.value === b.value;
  if (a instanceof AstExprConstantNumber && b instanceof AstExprConstantNumber) return a.value === b.value;
  if (a instanceof AstExprConstantString && b instanceof AstExprConstantString) return a.value === b.value;
  if (a instanceof AstExprLocal && b instanceof AstExprLocal) return a.local === b.local;
  if (a instanceof AstExprGlobal && b instanceof AstExprGlobal) return a.name === b.name;
  if (a instanceof AstExprVarargs) return true;
  if (a instanceof AstExprCall && b instanceof AstExprCall) {
    if (a.args.length !== b.args.length || a.self !== b.self || !similar(a.func, b.func)) return false;
    return a.args.every((arg, i) => similar(arg, b.args[i]!));
  }
  if (a instanceof AstExprIndexName && b instanceof AstExprIndexName) return a.index === b.index && similar(a.expr, b.expr);
  if (a instanceof AstExprIndexExpr && b instanceof AstExprIndexExpr) return similar(a.expr, b.expr) && similar(a.index, b.index);
  if (a instanceof AstExprTable && b instanceof AstExprTable) {
    if (a.items.length !== b.items.length) return false;
    return a.items.every((item, i) => {
      const other = b.items[i]!;
      if (item.kind !== other.kind) return false;
      if (!item.key !== !other.key) return false;
      if (item.key && other.key && !similar(item.key, other.key)) return false;
      return similar(item.value, other.value);
    });
  }
  if (a instanceof AstExprUnary && b instanceof AstExprUnary) return a.op === b.op && similar(a.expr, b.expr);
  if (a instanceof AstExprBinary && b instanceof AstExprBinary) return a.op === b.op && similar(a.left, b.left) && similar(a.right, b.right);
  if (a instanceof AstExprTypeAssertion && b instanceof AstExprTypeAssertion) return similar(a.expr, b.expr);
  if (a instanceof AstExprIfElse && b instanceof AstExprIfElse) {
    return similar(a.condition, b.condition) && similar(a.trueExpr, b.trueExpr) && similar(a.falseExpr, b.falseExpr);
  }
  if (a instanceof AstExprInterpString && b instanceof AstExprInterpString) {
    if (a.strings.length !== b.strings.length || a.expressions.length !== b.expressions.length) return false;
    return a.strings.every((s, i) => s === b.strings[i]) && a.expressions.every((e, i) => similar(e, b.expressions[i]!));
  }
  if (a instanceof AstExprSparkdownInterpString && b instanceof AstExprSparkdownInterpString) {
    if (a.strings.length !== b.strings.length || a.expressions.length !== b.expressions.length) return false;
    return a.strings.every((s, i) => s === b.strings[i]) && a.expressions.every((e, i) => similar(e, b.expressions[i]!));
  }
  if (a instanceof AstExprSparkdownCallShorthand && b instanceof AstExprSparkdownCallShorthand) return similar(a.expr, b.expr);
  if (a instanceof AstExprSparkdownDivertTarget && b instanceof AstExprSparkdownDivertTarget) return a.path === b.path;
  if (a instanceof AstExprSparkdownRegex && b instanceof AstExprSparkdownRegex) return a.pattern === b.pattern && a.flags === b.flags;
  if (a instanceof AstExprSparkdownNew && b instanceof AstExprSparkdownNew) {
    if (a.className !== b.className || a.hasArgs !== b.hasArgs || a.args.length !== b.args.length) return false;
    return a.args.every((arg, i) => similar(arg, b.args[i]!));
  }
  return false;
}

function lintDuplicateConditions(root: AstNode, offsets: Offsets, out: LuauLint[], narrative: (stat: AstStatIf) => boolean = () => false): void {
  const MAX_DISTANCE = 5;
  const detect = (conditions: AstExpr[]) => {
    for (let i = 0; i < conditions.length; i++) {
      for (let j = Math.max(i, MAX_DISTANCE) - MAX_DISTANCE; j < i; j++) {
        if (!similar(conditions[j]!, conditions[i]!)) continue;
        const here = conditions[i]!.location;
        const there = conditions[j]!.location.begin;
        out.push({
          code: "DuplicateCondition",
          ...offsets.range(here),
          message:
            here.begin.line === there.line
              ? `Condition has already been checked on column ${there.column + 1}`
              : `Condition has already been checked on line ${offsets.line(there) + 1}`,
        });
        break;
      }
    }
  };
  const chain = (expr: AstExpr, op: BinaryOp, conditions: AstExpr[]) => {
    if (expr instanceof AstExprBinary && expr.op === op) {
      chain(expr.left, op, conditions);
      chain(expr.right, op, conditions);
    } else if (expr instanceof AstExprGroup) chain(expr.expr, op, conditions);
    else conditions.push(expr);
  };
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstStatIf) {
        if (!(node.elsebody instanceof AstStatIf)) return true;
        const conditions: AstExpr[] = [];
        for (let head: AstStatIf | undefined = node; head; ) {
          visitAst(head.condition, visitor);
          visitAst(head.thenbody, visitor);
          conditions.push(head.condition);
          if (head.elsebody instanceof AstStatIf) {
            head = head.elsebody;
            continue;
          }
          if (head.elsebody) visitAst(head.elsebody, visitor);
          head = undefined;
        }
        if (!narrative(node)) detect(conditions);
        return false;
      }
      if (node instanceof AstExprIfElse) {
        if (!(node.falseExpr instanceof AstExprIfElse)) return true;
        const conditions: AstExpr[] = [];
        for (let head: AstExprIfElse | undefined = node; head; ) {
          visitAst(head.condition, visitor);
          visitAst(head.trueExpr, visitor);
          conditions.push(head.condition);
          if (head.falseExpr instanceof AstExprIfElse) {
            head = head.falseExpr;
            continue;
          }
          visitAst(head.falseExpr, visitor);
          head = undefined;
        }
        detect(conditions);
        return false;
      }
      if (node instanceof AstExprBinary) {
        if (node.op !== BinaryOp.And && node.op !== BinaryOp.Or) return true;
        if (node.op === BinaryOp.Or) {
          const la = node.left instanceof AstExprBinary ? node.left : undefined;
          if (la && la.op === BinaryOp.And) {
            const lb = la.left instanceof AstExprBinary ? la.left : undefined;
            const rb = la.right instanceof AstExprBinary ? la.right : undefined;
            if (!(lb && lb.op === BinaryOp.And) && !(rb && rb.op === BinaryOp.And)) {
              visitAst(la.left, visitor);
              visitAst(la.right, visitor);
              visitAst(node.right, visitor);
              return false;
            }
          }
        }
        const conditions: AstExpr[] = [];
        chain(node, node.op, conditions);
        detect(conditions);
        return false;
      }
      return true;
    },
  };
  visitAst(root, visitor);
}

function formatNumber(value: number) {
  return String(Number(value.toPrecision(6)));
}

function constantOf(expr: AstExpr): AstExprConstantNumber | undefined {
  return expr instanceof AstExprConstantNumber ? expr : undefined;
}

const BACKWARDS = "For loop should iterate backwards; did you forget to specify -1 as step?";

function lintForRanges(root: AstNode, offsets: Offsets, out: LuauLint[]): void {
  visitAst(root, {
    visit(node) {
      if (!(node instanceof AstStatFor) || node.step) return true;
      const fc = constantOf(node.from);
      const tc = constantOf(node.to);
      const fu = node.from instanceof AstExprUnary && node.from.op === UnaryOp.Len;
      const tu = node.to instanceof AstExprUnary && node.to.op === UnaryOp.Len;
      let message: string | undefined;
      if (fu && tc && tc.value === 1) message = BACKWARDS;
      else if (fc && tc && fc.value > tc.value) message = BACKWARDS;
      else if (fc && tc && fc.value + Math.floor(tc.value - fc.value) !== tc.value) {
        message = `For loop ends at ${formatNumber(fc.value + Math.floor(tc.value - fc.value))} instead of ${formatNumber(tc.value)}; did you forget to specify step?`;
      } else if (fc && tu && fc.value === 0) message = "For loop starts at 0, but arrays start at 1";
      else if (fu && tc && tc.value === 0) message = `${BACKWARDS} Also consider changing 0 to 1 since arrays start at 1`;
      if (message) out.push({ code: "ForRange", from: offsets.of(node.from.location.begin), to: offsets.of(node.to.location.end), message });
      return true;
    },
  });
}

const isComparison = (op: BinaryOp) =>
  op === BinaryOp.CompareEq || op === BinaryOp.CompareNe || op === BinaryOp.CompareLt || op === BinaryOp.CompareLe || op === BinaryOp.CompareGt || op === BinaryOp.CompareGe;
const isEquality = (op: BinaryOp) => op === BinaryOp.CompareEq || op === BinaryOp.CompareNe;
const isNot = (expr: AstExpr) => expr instanceof AstExprUnary && expr.op === UnaryOp.Not;

function lintExpressionPrecedence(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[]): void {
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprBinary) || errors.some((error) => node.location.overlaps(error.location))) return true;
      if (node.op === BinaryOp.Or && node.left instanceof AstExprBinary && node.left.op === BinaryOp.And) {
        const alternative = node.left.right;
        const alt = alternative instanceof AstExprConstantNil ? "nil" : alternative instanceof AstExprConstantBool && !alternative.value ? "false" : undefined;
        if (alt) {
          out.push({ code: "MisleadingAndOr", ...offsets.range(node.location), message: `The and-or expression always evaluates to the second alternative because the first alternative is ${alt}; consider using if-then-else expression instead` });
        }
      }
      if (!isComparison(node.op)) return true;
      const op = binaryOpToString(node.op);
      if (isNot(node.left) && !isNot(node.right)) {
        out.push({
          code: "ComparisonPrecedence",
          ...offsets.range(node.location),
          message: isEquality(node.op)
            ? `not X ${op} Y is equivalent to (not X) ${op} Y; consider using X ${node.op === BinaryOp.CompareEq ? "~=" : "=="} Y, or add parentheses to silence`
            : `not X ${op} Y is equivalent to (not X) ${op} Y; add parentheses to silence`,
        });
      } else if (node.left instanceof AstExprBinary && isComparison(node.left.op)) {
        const left = binaryOpToString(node.left.op);
        out.push({
          code: "ComparisonPrecedence",
          ...offsets.range(node.location),
          message: isEquality(node.left.op) || isEquality(node.op)
            ? `X ${left} Y ${op} Z is equivalent to (X ${left} Y) ${op} Z; add parentheses to silence`
            : `X ${left} Y ${op} Z is equivalent to (X ${left} Y) ${op} Z; did you mean X ${left} Y and Y ${op} Z?`,
        });
      }
      return true;
    },
  });
}

function lintIntegerParsing(root: AstNode, text: string, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[]): void {
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprConstantNumber) || errors.some((error) => node.location.overlaps(error.location))) return true;
      const range = offsets.range(node.location);
      if (/[A-Za-z0-9_.]/.test(text[range.to] ?? "")) return true;
      const literal = text.slice(range.from, range.to).replaceAll("_", "");
      if (!/^(0[bB][01]+|0[xX][0-9a-fA-F]+|[0-9]+)$/.test(literal)) return true;
      const value = numberLiteralValue(literal);
      if (Number.isSafeInteger(value)) return true;
      if (!Number.isFinite(value) || BigInt(value) !== BigInt(literal)) {
        out.push({ code: "IntegerParsing", ...range, message: "Number literal exceeded available precision and was truncated to closest representable number" });
      }
      return true;
    },
  });
}

function lintTableLiterals(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[]): void {
  const line = (location: Location) => offsets.line(location.begin) + 1;
  visitAst(root, {
    visit(node) {
      if ((node instanceof AstExprTable || node instanceof AstTypeTable) && errors.some((error) => node.location.overlaps(error.location))) return true;
      if (node instanceof AstExprTable) {
        const count = node.items.filter((item) => item.kind === TableItemKind.List).length;
        const names = new Map<string, number>();
        const indices = new Map<number, number>();
        for (const { key } of node.items) {
          if (key instanceof AstExprConstantString) {
            const previous = names.get(key.value);
            if (previous) out.push({ code: "TableLiteral", ...offsets.range(key.location), message: `Table field '${decodeBytes(key.value)}' is a duplicate; previously defined at line ${previous}` });
            else names.set(key.value, line(key.location));
          } else if (key instanceof AstExprConstantNumber && Number.isInteger(key.value)) {
            if (key.value >= 1 && key.value <= count) {
              out.push({ code: "TableLiteral", ...offsets.range(key.location), message: `Table index ${key.value} is a duplicate; previously defined as a list entry` });
            } else if (key.value >= 0 && key.value <= 2147483647) {
              const previous = indices.get(key.value);
              if (previous) out.push({ code: "TableLiteral", ...offsets.range(key.location), message: `Table index ${key.value} is a duplicate; previously defined at line ${previous}` });
              else indices.set(key.value, line(key.location));
            }
          }
        }
      } else if (node instanceof AstTypeTable) {
        const names = new Map<string, { access: AstTableAccess; location: Location }>();
        for (const prop of node.props) {
          const previous = names.get(prop.name);
          if (!previous) {
            names.set(prop.name, { access: prop.access, location: prop.location });
            continue;
          }
          if (!(previous.access & prop.access)) {
            previous.access |= prop.access;
            continue;
          }
          const at = line(previous.location);
          if (previous.access === prop.access) out.push({ code: "TableLiteral", ...offsets.range(prop.location), message: `Table type field '${decodeBytes(prop.name)}' is a duplicate; previously defined at line ${at}` });
          else if (previous.access === AstTableAccess.ReadWrite) out.push({ code: "TableLiteral", ...offsets.range(prop.location), message: `Table type field '${decodeBytes(prop.name)}' is already read-write; previously defined at line ${at}` });
          else out.push({ code: "TableLiteral", ...offsets.range(previous.location), message: `Table type field '${decodeBytes(prop.name)}' already has a ${previous.access === AstTableAccess.Read ? "read" : "write"} type defined at line ${at}` });
        }
      }
      return true;
    },
  });
}

const MULTIPLE_RESULTS = new Set(["string.find", "string.gsub", "math.frexp", "math.modf", "utf8.len", "utf8.codes", "coroutine.close"]);

function isConstant(expr: AstExpr | undefined, value: number): boolean {
  return expr instanceof AstExprConstantNumber && expr.value === value;
}

function isLength(expr: AstExpr, table: AstExpr): boolean {
  return expr instanceof AstExprUnary && expr.op === UnaryOp.Len && similar(expr.expr, table);
}

function lintStdlibCalls(root: AstNode, text: string, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], localNames?: ReadonlySet<string>): void {
  const report = (code: LuauLintCode, expr: AstExpr, message: string) => out.push({ code, ...offsets.range(expr.location), message });
  const zero = (name: string, expr: AstExpr) => report("TableOperations", expr, `table.${name} uses index 0 but arrays are 1-based; did you mean 1 instead?`);
  const runtimeValue = (literal: AstExprConstantString) => {
    const { from, to } = offsets.range(literal.location);
    return stringLiteralValue(text.slice(from, to), literal.quoteStyle === QuoteStyle.QuotedRaw);
  };
  const formatString = (literal: AstExprConstantString, message: string) => report("FormatString", literal, message);
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprCall) || errors.some((error) => node.location.overlaps(error.location))) return true;
      const global = node.func instanceof AstExprIndexName ? node.func.expr : node.func;
      if (localNames && global instanceof AstExprGlobal && localNames.has(global.name)) return true;
      lintFormatStringCall(node, runtimeValue, formatString);
      if (node.self) return true;
      const { func, args } = node;
      if (func instanceof AstExprGlobal && (func.name === "getfenv" || func.name === "setfenv") && args[0] instanceof AstExprConstantNumber) {
        report("DeprecatedApi", node, `Function '${func.name}' is deprecated${func.name === "getfenv" ? "; consider using 'debug.info' instead" : ""}`);
      }
      if (!(func instanceof AstExprIndexName && func.expr instanceof AstExprGlobal && func.expr.name === "table")) return true;
      if (func.index === "insert" && args.length === 2) {
        const tail = args[1];
        if (tail instanceof AstExprCall && !tail.self && tail.func instanceof AstExprIndexName && tail.func.expr instanceof AstExprGlobal && MULTIPLE_RESULTS.has(`${tail.func.expr.name}.${tail.func.index}`)) {
          report("TableOperations", tail, "table.insert may change behavior if the call returns more than one result; consider adding parentheses around second argument");
        }
      }
      if (func.index === "insert" && args.length >= 3) {
        const position = args[1]!;
        if (isConstant(position, 0)) zero("insert", position);
        if (isLength(position, args[0]!)) {
          report("TableOperations", position, "table.insert will insert the value before the last element, which is likely a bug; consider removing the second argument or wrap it in parentheses to silence");
        }
        if (position instanceof AstExprBinary && position.op === BinaryOp.Add && isLength(position.left, args[0]!) && isConstant(position.right, 1)) {
          report("TableOperations", position, "table.insert will append the value to the table; consider removing the second argument for efficiency");
        }
      }
      if (func.index === "remove" && args.length >= 2) {
        const position = args[1]!;
        if (isConstant(position, 0)) zero("remove", position);
        if (position instanceof AstExprBinary && position.op === BinaryOp.Sub && isLength(position.left, args[0]!) && isConstant(position.right, 1)) {
          report("TableOperations", position, "table.remove will remove the value before the last element, which is likely a bug; consider removing the second argument or wrap it in parentheses to silence");
        }
      }
      if (func.index === "move" && args.length >= 4) {
        if (isConstant(args[1], 0)) zero("move", args[1]!);
        else if (isConstant(args[3], 0)) zero("move", args[3]!);
      }
      if (func.index === "create" && args.length === 2) {
        const value = args[1]!;
        const literal = value instanceof AstExprTypeAssertion ? value.expr : value;
        if (literal instanceof AstExprTable) report("TableOperations", literal, "table.create with a table literal will reuse the same object for all elements; consider using a for loop instead");
      }
      return true;
    },
  });
}


export function lintBuiltinGlobalWrites(program: LuauProgramNames): { uri: string; lint: LuauLint }[] {
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, global] of program.globals) {
    if (!BUILTIN_GLOBALS.has(name) || program.uncertainNames.has(name)) continue;
    const locals: { uri: string; from: number; scope?: AstStatBlock }[] = [];
    for (const [uri, names] of program.scripts) {
      for (const d of names.declarations) if (d.name === name && d.outermost) locals.push({ uri, from: d.from, scope: d.scope });
    }
    for (const { uri, from, to, kind, scope } of global.definitions) {
      const hidden = locals.some((local) => !(local.uri === uri && local.scope === scope && to <= local.from));
      if (hidden && kind !== "store" && kind !== "const") continue;
      found.push({ uri, lint: { code: "BuiltinGlobalWrite", from, to, message: `Built-in global '${name}' is overwritten here; consider using a local or changing the name` } });
    }
  }
  return found;
}

function lintStatementLayout(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], sameLines: Set<number>): void {
  const stack: { start: Position; lastLine: number; flagged: boolean }[] = [];
  const complete = (stat: AstStat) => !errors.some((error) => stat.location.overlaps(error.location));
  visitAst(root, {
    visit(node) {
      if (node instanceof AstStatError || node instanceof AstExprError) return false;
      if (node instanceof AstExprFunction && !readToEnd(node)) return false;
      if (node instanceof AstStat && !(node instanceof AstStatBlock) && !complete(node)) return false;
      if (!(node instanceof AstStatBlock)) return true;
      if (!node.hasEnd) return false;
      for (let i = 1; i < node.body.length; i++) {
        const stat = node.body[i]!;
        const previous = node.body[i - 1]!;
        const line = offsets.line(stat.location.begin);
        if (!complete(stat) || !complete(previous) || previous instanceof AstStatError || stat instanceof AstStatError) continue;
        if (offsets.line(previous.location.end) !== line || sameLines.has(line)) continue;
        if (previous.hasSemicolon || (previous instanceof AstStatLocal && stat instanceof AstStatBlock)) continue;
        out.push({ code: "SameLineStatement", ...offsets.range(stat.location), message: "A new statement is on the same line; add semi-colon on previous statement to silence" });
        sameLines.add(line);
      }
      return true;
    },
  });
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstStatError || node instanceof AstExprError) return false;
      if (node instanceof AstExprFunction && !readToEnd(node)) return false;
      if (node instanceof AstStatBlock) {
        if (!node.hasEnd) return false;
        for (const stat of node.body) {
          if (!complete(stat)) continue;
          const line = offsets.line(stat.location.begin);
          stack.push({ start: stat.location.begin, lastLine: line, flagged: false });
          visitAst(stat, visitor);
          stack.pop();
        }
        return false;
      }
      if (node instanceof AstExprTable) return false;
      if (node instanceof AstStatRepeat) {
        visitAst(node.body, visitor);
        return false;
      }
      const statement = stack[stack.length - 1];
      if (node instanceof AstExpr && statement && !statement.flagged) {
        const line = offsets.line(node.location.begin);
        if (line > statement.lastLine) {
          statement.lastLine = line;
          if (node.location.begin.column <= statement.start.column) {
            out.push({ code: "MultiLineStatement", ...offsets.range(node.location), message: "Statement spans multiple lines; use indentation to silence" });
            statement.flagged = true;
          }
        }
      }
      return true;
    },
  };
  visitAst(root, visitor);
}

const documentFacts = new WeakMap<Tree, { outside: OutsideReading[]; narrativeIfs: Set<number>; names: LuauNameFacts; roots: NameRoot[]; uncertainGlobalUses: Set<number>; outermostLocals: Set<string>; misreadStatements: NameRange[]; errorLines: NameRange[]; mentionsUnplaced: (name: string) => boolean; mentionsUnplacedVariable: (name: string) => boolean; topLevelMembers: TopLevelMemberDefinition[]; parameterStarts: Set<number> }>();

export function collectLuauLints(tree: Tree, read: (from: number, to: number) => string, { luauFile = false }: { luauFile?: boolean } = {}): LuauScriptLints {
  const text = read(0, tree.length);
  const starts = lineStarts(text);
  const units = readDocumentUnits(tree, text, luauFile);
  let facts = documentFacts.get(tree);
  if (!facts) {
    const nodes = lintSyntaxNodes(tree, text);
    const outside = expressionsOutsideUnits(nodes, text, [units.prelude, ...units.flows]);
    const roots: NameRoot[] = [units.prelude, ...units.flows].map((unit) => ({
      root: unit.root,
      offsets: new Offsets(starts, unit.lines),
      syntheticFunction: unit.kind === "flow" && unit.root.body[0] instanceof AstStatLocalFunction ? unit.root.body[0] : undefined,
    }));
    roots.push(...outside.map(({ expr, statements }) => ({ root: statements && expr instanceof AstExprFunction ? expr.body : expr, offsets: new Offsets(starts, undefined), functionBody: statements && expr instanceof AstExprFunction })));
    const names = collectNameFacts(roots, text);
    names.uncertainNames = uncertainNames(nodes, text, names);
    const documentOffsets = new Offsets(starts, undefined);
    const errors: NameRange[] = [];
    const error = (offsets: Offsets, location: Location) => errors.push({ from: starts[offsets.line(location.begin)] ?? 0, to: starts[offsets.line(location.end) + 1] ?? text.length });
    for (const unit of [units.prelude, ...units.flows]) {
      const offsets = new Offsets(starts, unit.lines);
      for (const { location } of unit.errors) error(offsets, location);
    }
    for (const { errors: found } of outside) for (const { location } of found) error(documentOffsets, location);
    const outsideRanges = outside.map(({ expr }) => documentOffsets.range(expr.location));
    const parameterStarts = new Set<number>();
    const flows = flowParameters(tree, text, parameterStarts);
    const outermostLocals = new Set(names.declarations.filter((d) => d.outermost && !parameterStarts.has(d.from)).map((d) => d.name));
    const misreadStatements: NameRange[] = [];
    const misread = (root: AstNode, offsets: Offsets, found: readonly { location: Location }[]) => {
      if (!readToEnd(root) || found.some((error) => root.location.overlaps(error.location))) misreadStatements.push(offsets.range(root.location));
    };
    for (const unit of [units.prelude, ...units.flows]) {
      const offsets = new Offsets(starts, unit.lines);
      for (const source of unit.statements) misread(source.statement, offsets, unit.errors);
    }
    for (const { expr, errors: found } of outside) misread(expr, documentOffsets, found);
    let placed: Set<number> | undefined;
    let definitions: Set<number> | undefined;
    let fields: Set<number> | undefined;
    const mentions = new Map<string, boolean>();
    const variableMentions = new Map<string, boolean>();
    const mentionsUnplaced = (name: string) => {
      let found = mentions.get(name);
      if (found === undefined) {
        placed ??= new Set([...names.declarations, ...names.references, ...names.globals, ...names.functions, ...names.uncertainNames].map((range) => range.from));
        definitions ??= new Set(names.functions.map((range) => range.from));
        mentions.set(name, (found = unplacedMention(tree, text, placed, definitions, misreadStatements.length > 0, name)));
      }
      return found;
    };
    const mentionsUnplacedVariable = (name: string) => {
      let found = variableMentions.get(name);
      if (found === undefined) {
        placed ??= new Set([...names.declarations, ...names.references, ...names.globals, ...names.functions, ...names.uncertainNames].map((range) => range.from));
        definitions ??= new Set(names.functions.map((range) => range.from));
        fields ??= new Set([...placed, ...fieldNames(roots)]);
        variableMentions.set(name, (found = unplacedMention(tree, text, fields, definitions, misreadStatements.length > 0, name)));
      }
      return found;
    };
    facts = { outside, narrativeIfs: narrativeIfStarts(nodes), names, roots, uncertainGlobalUses: uncertainGlobalUses(names, outsideRanges, flows, errors), outermostLocals, misreadStatements, errorLines: errors, mentionsUnplaced, mentionsUnplacedVariable, topLevelMembers: topLevelMembers(names, units.prelude.root, misreadStatements), parameterStarts };
    documentFacts.set(tree, facts);
  }
  const { narrativeIfs } = facts;
  const unsure = (range: NameRange) => [...facts.errorLines, ...facts.misreadStatements].some((at) => range.from < at.to && at.from < range.to);
  const out: LuauLint[] = [];
  const sameLines = new Set<number>();
  const globalShadows: GlobalShadowCandidate[] = [];
  const declaredLocals = new Set(facts.names.declarations.map((d) => d.local));
  const published = (local: AstLocal) => local.isConst && !declaredLocals.has(local);
  const flowParameter = (offsets: Offsets, local: AstLocal) => facts.parameterStarts.has(offsets.of(local.location.begin));
  const methodOffsets = new Offsets(starts, undefined);
  const methods = facts.outside.filter((reading) => reading.method).map(({ expr }) => ({ expr, offsets: methodOffsets }));
  const lintFunctions = (functions: AstExprFunction[], offsets: Offsets, errors: readonly { location: Location }[]) => {
    for (const fn of functions) {
      const broken = errors.some((error) => fn.location.overlaps(error.location));
      lintUnusedLocals(fn, tree, text, offsets, out, broken, methods.filter((method) => method.expr !== fn));
      lintLocalShadows(fn, tree, text, offsets, out, globalShadows, published);
      lintPlaceholderReads(fn, offsets, out);
      if (!typeOnly.has(fn)) lintUninitializedLocals(fn, tree, text, offsets, out, broken);
      lintUnreachable(fn, offsets, out);
      if (!broken && !typeOnly.has(fn)) lintImplicitReturns(fn, offsets, out);
    }
  };
  for (const unit of [units.prelude, ...units.flows]) {
    const offsets = new Offsets(starts, unit.lines);
    const narrative = (stat: AstStatIf) => narrativeIfs.has(offsets.of(stat.location.begin));
    lintFunctions(definedFunctions(unit), offsets, unit.errors);
    lintStatementLayout(unit.root, offsets, out, unit.errors, sameLines);
    lintDuplicateFunctions(unit.root, offsets, out, unit.errors, facts.names.uncertainNames, unit === units.prelude ? unit.root : undefined);
    lintDuplicateLocals(unit.root, offsets, out, unit.errors, published, flowParameter);
    for (const source of unit.statements) {
      lintDuplicateConditions(source.statement, offsets, out, narrative);
      lintForRanges(source.statement, offsets, out);
      lintExpressionPrecedence(source.statement, offsets, out, unit.errors);
      lintIntegerParsing(source.statement, text, offsets, out, unit.errors);
      lintUnbalancedAssignments(source.statement, text, offsets, out, unsure);
      lintTableLiterals(source.statement, offsets, out, unit.errors);
      lintStdlibCalls(source.statement, text, offsets, out, unit.errors);
    }
  }
  const documentOffsets = new Offsets(starts, undefined);
  const localNames = new Set(facts.names.declarations.map((d) => d.name));
  for (const { expr, statements, errors } of facts.outside) {
    const functions: AstExprFunction[] = [];
    completeFunctions(statements && expr instanceof AstExprFunction ? expr.body : expr, functions);
    lintFunctions(functions, documentOffsets, errors);
    lintStatementLayout(expr, documentOffsets, out, errors, sameLines);
    lintDuplicateFunctions(expr, documentOffsets, out, errors, facts.names.uncertainNames);
    lintDuplicateLocals(expr, documentOffsets, out, errors, published, flowParameter);
    lintDuplicateConditions(expr, documentOffsets, out);
    lintForRanges(expr, documentOffsets, out);
    lintExpressionPrecedence(expr, documentOffsets, out, errors);
    lintIntegerParsing(expr, text, documentOffsets, out, errors);
    lintUnbalancedAssignments(expr, text, documentOffsets, out, unsure);
    lintTableLiterals(expr, documentOffsets, out, errors);
    lintStdlibCalls(expr, text, documentOffsets, out, errors, localNames);
  }
  const order = (a: NameRange, b: NameRange) => a.from - b.from || a.to - b.to;
  return { lints: out.sort(order), names: facts.names, roots: facts.roots, globalShadows: globalShadows.sort(order), uncertainGlobalUses: facts.uncertainGlobalUses, outermostLocals: facts.outermostLocals, mentionsUnplaced: facts.mentionsUnplaced, mentionsUnplacedVariable: facts.mentionsUnplacedVariable, misreadStatements: facts.misreadStatements, topLevelMembers: facts.topLevelMembers };
}
