import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { findOwnDeclarationName } from "@impower/sparkdown/src/compiler/lower/utils/findOwnDeclarationName";
import { soleVariableName } from "@impower/sparkdown/src/compiler/lint/luauTree";
import { collectDefineTypeNames } from "@impower/sparkdown/src/compiler/utils/collectDefineTypeNames";
import {
  AstExpr, AstExprConstantString, AstExprFunction, AstExprGlobal, AstExprGroup,
  AstExprIndexExpr, AstExprIndexName, AstExprLocal, AstExprTable, AstLocal,
  AstStat, AstStatAssign, AstStatBlock, AstStatError, AstStatFor, AstStatForIn,
  AstStatFunction, AstStatIf, AstStatLocal, AstStatLocalFunction, AstStatRepeat,
  AstStatSparkdownExplicit, AstStatSparkdownStore, AstStatWhile, AstType,
  AstTypePack, visitAst, type AstNode, type AstVisitor,
} from "@impower/sparkdown/src/compiler/typecheck/Ast";
import { type Location } from "@impower/sparkdown/src/compiler/typecheck/Location";
import {
  readLuauExpression, readLuauMethod, readLuauStatements, readLuauUnits, type LuauAstUnits,
} from "@impower/sparkdown/src/compiler/typecheck/readLuauAst";
import { RESERVED } from "@impower/sparkdown/src/compiler/typecheck/LuauUnitNodes";
import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import { assignmentListName, ownAssignmentOperation } from "@impower/sparkdown/src/compiler/utils/variableDefinitionNames";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";
import { getDeclarationScopeInfo, type AnnotatedScript } from "../annotations/getDeclarationScopes";
import { getParentSectionPath } from "../syntax/getParentSectionPath";

// This is a syntax inventory, not inferred types. Only literal table keys,
// assignments, aliases and declared functions contribute members. Calls,
// annotations, metatables and compatibility judgments belong to the checker.
interface Shape {
  members?: Map<string, Shape | undefined>;
  callable?: boolean;
}
const FUNCTION: Shape = { callable: true };
class Globals extends Map<string, Shape | undefined> {
  private readonly requested = new Set<string>();
  private readonly assigned = new Map<string, Shape | undefined>();
  constructor(private readonly load: (name: string) => void) { super(); }
  peek(name: string): Shape | undefined { return super.get(name); }
  override get(name: string): Shape | undefined {
    return this.assigned.has(name) ? this.assigned.get(name) : this.initial(name);
  }
  assign(name: string, value: Shape | undefined) { this.assigned.set(name, value); }
  initial(name: string): Shape | undefined {
    // Lazy story-start declarations and their aliases must see the original
    // bindings, independently of later procedural writes (including unknowns).
    // A namespace can already exist while another script contributes more
    // children. Load every candidate owner once, including existing names.
    if (!this.requested.has(name)) {
      this.requested.add(name);
      this.load(name);
    }
    return super.get(name);
  }
}
interface DefineHeader { name: string; parent?: string }
interface DefineIndex {
  text: string;
  headers: DefineHeader[];
  types: Set<string>;
}
const defineIndexes = new WeakMap<Tree, DefineIndex>();
function defineIndex(tree: Tree, text: string): DefineIndex {
  const previous = defineIndexes.get(tree);
  if (previous?.text === text) return previous;
  const headers: DefineHeader[] = [];
  tree.iterate({ enter(ref) {
    if (ref.name !== "LuauDefine") return;
    const name = getDescendent("LuauDefineName", ref.node);
    const parent = getDescendent("LuauDefineParentName", ref.node);
    if (name) headers.push({ name: text.slice(name.from, name.to), parent: parent ? text.slice(parent.from, parent.to).trim() : undefined });
  } });
  const result = { text, headers, types: collectDefineTypeNames(tree, (from, to) => text.slice(from, to)) };
  defineIndexes.set(tree, result);
  return result;
}
interface Reading {
  text: string;
  units: LuauAstUnits;
  defines: (DefineHeader & { shape: Shape })[];
  functions: string[];
  stores: AstStatSparkdownStore[];
  sites: Site[];
  contexts: Map<string, { expr: AstExpr; sites: Site[] }>;
  bindings: Map<string, string[]>;
  properties: Map<number, { name?: string; expr?: AstExpr }>;
  offset(line: number, column: number): number;
  sectionAt(offset: number): string[];
}
const readings = new WeakMap<Tree, Reading>();
const strings = new WeakMap<AstExprConstantString, string>();
const decoder = new TextDecoder();
function stringValue(expr: AstExprConstantString): string {
  const previous = strings.get(expr);
  if (previous !== undefined) return previous;
  const value = /^[\u0000-\u007f]*$/.test(expr.value) ? expr.value
    : decoder.decode(Uint8Array.from(expr.value, (char) => char.charCodeAt(0)));
  strings.set(expr, value);
  return value;
}

/** A define property's own key/value, shared by shape seeding and cursor reading. */
function propertyReading(read: Reading, node: SyntaxNode): { name?: string; expr?: AstExpr } {
  const previous = read.properties.get(node.from);
  if (previous) return previous;
  const content = node.getChild(`${node.name}_content`);
  const assignment = content?.getChild("LuauVariableAssignment") ?? content?.getChild("LuauBracketKeyAssignment");
  // A bracket key can close the property's syntax node before its '='.
  // Select that immediately adjacent operation, never a nested assignment
  // in the property's function/table value or a later define member.
  const adjacent = node.nextSibling;
  const operation = (assignment && ownAssignmentOperation(assignment))
    ?? content?.getChild("LuauAssignmentOperation")
    ?? (assignment?.name === "LuauBracketKeyAssignment" && adjacent?.from === node.to
      && isExplicitRuleName(adjacent.name, "LuauAssignmentOperation") ? adjacent : undefined);
  const values: SyntaxNode[] = [];
  const valueContent = operation?.getChild(`${operation.name}_content`);
  for (let child = valueContent?.firstChild; child; child = child.nextSibling) {
    if (child.name !== "LuauAssignmentOperator") values.push(child);
  }
  // The shared expression reader owns continuation, including a value after
  // a line-ending '='; another define member is never part of this RHS.
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (operation && next.to <= operation.to) continue;
    if (["LuauPropertyDefinition", "LuauMethodDefinition", "LuauFunctionDefinition"].some((name) => isExplicitRuleName(next.name, name))) break;
    values.push(next);
  }
  let name: string | undefined;
  if (assignment?.name === "LuauBracketKeyAssignment") {
    const index = assignment.getChild("LuauBracketKeyAssignment_content")?.getChild("LuauTableIndexDeclaration");
    const keyNodes: SyntaxNode[] = [];
    for (let child = index?.getChild("LuauTableIndexDeclaration_content")?.firstChild; child; child = child.nextSibling) keyNodes.push(child);
    const key = keyNodes.length ? readLuauExpression(keyNodes, read.text).expr : undefined;
    if (key instanceof AstExprConstantString) name = stringValue(key);
  } else if (assignment) {
    const key = assignmentListName(assignment);
    if (key) name = read.text.slice(key.from, key.to);
  }
  const result = { name, expr: values.length ? readLuauExpression(values, read.text).expr : undefined };
  read.properties.set(node.from, result);
  return result;
}

function reading(tree: Tree, text: string): Reading {
  const previous = readings.get(tree);
  if (previous?.text === text) return previous;
  const lines = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) lines.push(at + 1);
  const sections = new Map<number, string[]>();
  const result: Reading = {
    text, units: readLuauUnits(tree, text), defines: [], functions: [], stores: [], sites: [], contexts: new Map(), bindings: new Map(), properties: new Map(),
    offset: (line, column) => (lines[line] ?? text.length) + column,
    sectionAt(offset) {
      const stack = getStack<SparkdownNodeName>(tree, offset, 1);
      const top = stack.at(-2);
      if (!top) return [];
      const previous = sections.get(top.from);
      if (previous) return previous;
      const path = getParentSectionPath(stack, (from, to) => text.slice(from, to));
      // The shared path excludes the header itself. Synthetic flow and
      // branch parameter declarations stand on their own header line.
      const key = top.name === "Scene" ? getDescendent("SceneDeclarationName", top)
        : top.name === "Branch" ? getDescendent("BranchDeclarationName", top) : undefined;
      const own = key && text.slice(key.from, key.to);
      const section = own ? top.name === "Scene" ? [own] : [...path, own] : path;
      sections.set(top.from, section);
      return section;
    },
  };
  result.sites = memberSites(result);
  // Top-level named functions are story functions, available as values
  // when stores initialize. Nested functions and generated flow wrappers
  // keep their lexical identities and are never initial global bindings.
  for (const stat of result.units.prelude.root.body) {
    const declaration = stat instanceof AstStatSparkdownExplicit ? stat.statement : stat;
    if (declaration instanceof AstStatFunction && declaration.name instanceof AstExprGlobal) result.functions.push(declaration.name.name);
  }
  for (const unit of [result.units.prelude, ...result.units.flows]) {
    visitAst(unit.root, { visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstStatSparkdownStore) {
        result.stores.push(node);
        return false;
      }
      return true;
    } });
  }
  // A define is a runtime singleton table. Its own members are available
  // even before compilation, including methods absent from program.context.
  const scan = (node: SyntaxNode) => {
    if (node.name === "LuauDefine") {
      const name = getDescendent("LuauDefineName", node);
      const body = node.getChild("LuauDefine_content");
      if (name && body) {
        const members = new Map<string, Shape | undefined>();
        for (let child = body.firstChild; child; child = child.nextSibling) {
          if (child.name === "LuauPropertyDefinition") {
            const property = propertyReading(result, child);
            if (property.name !== undefined) members.set(property.name, literal(property.expr));
          } else if (child.name === "LuauMethodDefinition" || child.name === "LuauFunctionDefinition") {
            const header = child.name === "LuauFunctionDefinition" ? findOwnDeclarationName(child) : child;
            const key = header && getDescendent("LuauFunctionName", header);
            if (key) members.set(text.slice(key.from, key.to), FUNCTION);
          }
        }
        const parent = getDescendent("LuauDefineParentName", node);
        // Leaf names are only unique within their declared parent namespace.
        result.defines.push({ name: text.slice(name.from, name.to), parent: parent ? text.slice(parent.from, parent.to).trim() : undefined, shape: { members } });
      }
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) scan(child);
  };
  scan(tree.topNode);
  readings.set(tree, result);
  return result;
}

function literal(expr: AstExpr | undefined, resolve: (expr: AstExpr) => Shape | undefined = () => undefined): Shape | undefined {
  if (!expr) return undefined;
  if (expr instanceof AstExprGroup) return literal(expr.expr, resolve);
  if (expr instanceof AstExprFunction) return FUNCTION;
  if (expr instanceof AstExprTable) {
    const members = new Map<string, Shape | undefined>();
    for (const item of expr.items) {
      if (item.key instanceof AstExprConstantString) {
        members.set(stringValue(item.key), literal(item.value, resolve));
      }
    }
    return { members };
  }
  return resolve(expr);
}

interface Site {
  receiver: AstExpr;
  start: number;
  from: number;
  to: number;
  colon: boolean;
  quote?: string;
}

function memberSites(read: Reading, roots: readonly AstNode[] = [read.units.prelude.root, ...read.units.flows.map((unit) => unit.root)]): Site[] {
  const sites: Site[] = [];
  const offset = (location: Location) => read.offset(location.begin.line, location.begin.column);
  const visitor: AstVisitor = {
      visit(node) {
        if (node instanceof AstType || node instanceof AstTypePack) return false;
        // A dotted function declaration names the method being defined;
        // it is not a request for members of its receiver.
        if (node instanceof AstStatFunction) {
          visitAst(node.func, visitor);
          return false;
        }
        if (node instanceof AstExprIndexName) {
          const operator = read.offset(node.opPosition.line, node.opPosition.column);
          const tail = /^[ \t]*[A-Za-z_0-9]*/.exec(read.text.slice(operator + 1))![0];
          const whitespace = /^[ \t]*/.exec(tail)![0].length;
          const from = operator + 1 + whitespace;
          const to = operator + 1 + tail.length;
          sites.push({ receiver: node.expr, start: operator + 1, from, to, colon: node.op === ":" });
        } else if (node instanceof AstExprIndexExpr) {
          const from = offset(node.index.location);
          const end = read.offset(node.index.location.end.line, node.index.location.end.column);
          const raw = read.text.slice(from, end);
          const quote = raw[0];
          if (quote === '"' || quote === "'") {
            const to = end - (raw.length > 1 && raw.at(-1) === quote ? 1 : 0);
            sites.push({ receiver: node.expr, start: from + 1, from: from + 1, to, colon: false, quote });
          }
        }
        return true;
      },
    };
  for (const root of roots) visitAst(root, visitor);
  return sites.sort((a, b) => a.start - b.start);
}

function memberSite(read: { sites: Site[] }, cursor: number): Site | undefined {
  let from = 0;
  let to = read.sites.length;
  while (from < to) {
    const middle = (from + to) >>> 1;
    if (read.sites[middle]!.start <= cursor) from = middle + 1;
    else to = middle;
  }
  const site = read.sites[from - 1];
  return site && cursor <= site.to ? site : undefined;
}

interface OutsideContext { from: number; expr?: AstExpr; bindings: readonly string[] }

/** Runtime evaluator parameters absent from the standalone expression reader. */
function contextBindings(read: Reading, node: SyntaxNode, cursor: number): readonly string[] {
  const component = node.name === "LuauComponent";
  const loop = node.name === "LuauSparkleForLoop" || node.name === "LuauSparkleBlockFor";
  if (!component && !loop) return [];
  const content = node.getChild(`${node.name}_content`);
  const header = component ? content?.getChild("LuauComponentNameAndInheritance") : content?.getChild("LuauSparkleDoMark");
  // A loop's bounds/iterable and empty-loop fallback retain outer bindings.
  // Component names/parameter annotations likewise are not body expressions.
  const fallback = loop ? content?.getChild("LuauSparkleElseBlock") ?? content?.getChild("LuauSparkleBlockElse") : undefined;
  if (!header || cursor < header.to || (fallback && cursor >= fallback.from)) return [];
  const key = `${node.name}:${node.from}:${node.to}`;
  const previous = read.bindings.get(key);
  if (previous) return previous;
  const names: string[] = [];
  if (component) {
    const parameters = header.getChild("LuauComponentNameAndInheritance_content")
      ?.getChild("LuauFunctionParameters")?.getChild("LuauFunctionParameters_content");
    // Only this header's direct parameters; nested function parameters and
    // identifiers in type annotations keep their actual owners.
    for (let child = parameters?.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauFunctionParameter") names.push(read.text.slice(child.from, child.to));
    }
  } else {
    const condition = content?.getChild("LuauForCondition")?.getChild("LuauForCondition_content");
    for (let child = condition?.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauInKeyword" || isExplicitRuleName(child.name, "LuauAssignmentOperation")) break;
      if (isExplicitRuleName(child.name, "LuauAccessPath")) {
        const name = soleVariableName(child);
        if (name) names.push(read.text.slice(name.from, name.to));
      }
    }
  }
  read.bindings.set(key, names);
  return names;
}

/** Read only the authored contexts enclosing this request, outside statement units. */
function outsideSite(read: Reading, tree: Tree, cursor: number): { site: Site; contexts: OutsideContext[] } | undefined {
  const contexts: OutsideContext[] = [];
  const stack = getStack(tree, cursor, -1).reverse();
  for (let index = 0; index < stack.length; index++) {
    const node = stack[index]!;
    if (isExplicitRuleName(node.name, "LuauFunctionDefinition")) {
      // Qualified declaration targets use an owned access path instead of
      // LuauFunctionDeclarationName. Neither is a value member request;
      // function-body paths have their own body owner and remain eligible.
      const name = findOwnDeclarationName(node)
        ?? node.getChild("LuauFunctionDefinition_content")?.getChild("LuauAccessPath");
      if (name && name.from <= cursor && cursor <= name.to) return undefined;
    }
    // Bracket/continued values can be siblings of the property's key node.
    // The nearest preceding member is the only candidate owner; the shared
    // expression reader's actual span decides whether its value encloses us.
    if (isExplicitRuleName(node.name, "LuauDefine_content")) {
      const child = stack[index + 1];
      if (child && !isExplicitRuleName(child.name, "LuauPropertyDefinition")) {
        for (let previous = child.prevSibling; previous; previous = previous.prevSibling) {
          if (isExplicitRuleName(previous.name, "LuauPropertyDefinition")) {
            const expr = propertyReading(read, previous).expr;
            if (expr && read.offset(expr.location.begin.line, expr.location.begin.column) <= cursor
              && cursor <= read.offset(expr.location.end.line, expr.location.end.column)) stack.splice(index + 1, 0, previous);
            break;
          }
          if (isExplicitRuleName(previous.name, "LuauMethodDefinition") || isExplicitRuleName(previous.name, "LuauFunctionDefinition")) break;
        }
      }
    }
    const method = isExplicitRuleName(node.name, "LuauMethodDefinition");
    const defineFunction = isExplicitRuleName(node.name, "LuauFunctionDefinition") && isExplicitRuleName(node.parent?.name, "LuauDefine_content");
    const property = isExplicitRuleName(node.name, "LuauPropertyDefinition");
    const handler = isExplicitRuleName(node.name, "LuauSparkleHandlerClosure");
    const callHandler = node.name === "LuauSparkleEventHandler" || node.name === "LuauEventAttribute_content";
    const bindings = contextBindings(read, node, cursor);
    if (bindings.length) contexts.push({ from: node.from, bindings });
    // Closure bodies supply their own event binding below. A named handler
    // reference is a function value, not an evaluator with a new parameter.
    if (callHandler && !getDescendent("LuauSparkleHandlerClosure", node) && !getDescendent("LuauSparkleEventHandlerName", node)) {
      contexts.push({ from: node.from, bindings: ["event"] });
    }
    const expression = isExplicitRuleName(node.name, "LuauInterpolatedStringExpression") || isExplicitRuleName(node.name, "LuauAccessPath");
    if (!method && !defineFunction && !property && !handler && !expression) continue;
    const key = `${node.name}:${node.from}:${node.to}`;
    let context = read.contexts.get(key);
    if (!context) {
      let expr: AstExpr | undefined;
      if (method) expr = readLuauMethod(node, read.text).expr;
      else if (defineFunction) {
        const wrapper = readLuauStatements([node], read.text).expr;
        const declaration = wrapper instanceof AstExprFunction ? wrapper.body.body[0] : undefined;
        // The define's name is a table member, never a bare global assignment.
        if (declaration instanceof AstStatFunction) expr = declaration.func;
      } else if (property) {
        expr = propertyReading(read, node).expr;
      } else if (handler) {
        const content = node.getChild("LuauSparkleHandlerClosure_content");
        if (content) expr = readLuauStatements([content], read.text).expr;
      } else expr = readLuauExpression(node, read.text).expr;
      if (!expr) continue;
      context = { expr, sites: memberSites(read, [expr]) };
      read.contexts.set(key, context);
    }
    contexts.push({ from: node.from, expr: context.expr, bindings: method || defineFunction ? ["self"] : handler ? ["event"] : [] });
    const site = memberSite(context, cursor);
    if (site) return { site, contexts };
  }
  return undefined;
}

function copyShape(shape: Shape, copies: Map<Shape, Shape>): Shape {
  const previous = copies.get(shape);
  if (previous) return previous;
  const copy: Shape = { callable: shape.callable };
  copies.set(shape, copy);
  if (shape.members) {
    copy.members = new Map();
    shape.members.forEach((value, name) => copy.members!.set(name, value && copyShape(value, copies)));
  }
  return copy;
}

class Inventory {
  readonly locals = new Map<AstLocal, Shape | undefined>();
  private readonly localOffsets = new Map<number, AstLocal>();
  private readonly localValues = new Map<number, Shape | undefined>();
  private ambient: ReadonlyMap<string, { declarationFrom: number }> | undefined;
  private readonly contextLocals = new Map<string, { value: Shape | undefined; from: number }>();
  private inFlow = false;
  private readonly section: string[];
  constructor(readonly globals: Globals, readonly read: Reading, readonly cursor: number) {
    this.section = cursor < 0 ? [] : read.sectionAt(cursor);
  }
  private activeSection(location: Location) {
    const path = this.read.sectionAt(this.read.offset(location.begin.line, location.begin.column));
    return path.every((name, index) => name === this.section[index]);
  }
  private visibleLocal(local: AstLocal): AstLocal | undefined {
    // The checker reader flattens branch parameters into its scene unit.
    // Follow its real shadow chain when a branch has closed at this cursor.
    let visible: AstLocal | undefined = local;
    while (visible && !this.activeSection(visible.location)) visible = visible.shadow;
    return visible;
  }
  runFlow(root: AstStatBlock) {
    this.inFlow = true;
    try { this.run(root); } finally { this.inFlow = false; }
  }
  contains(location: Location) {
    return this.read.offset(location.begin.line, location.begin.column) <= this.cursor &&
      this.read.offset(location.end.line, location.end.column) >= this.cursor;
  }
  value(expr: AstExpr): Shape | undefined {
    if (expr instanceof AstExprLocal) {
      const local = this.visibleLocal(expr.local);
      return local ? this.locals.get(local) : this.global(expr.local.name);
    }
    if (expr instanceof AstExprGlobal) return this.global(expr.name);
    if (expr instanceof AstExprIndexName) return this.value(expr.expr)?.members?.get(expr.index);
    if (expr instanceof AstExprIndexExpr && expr.index instanceof AstExprConstantString) {
      return this.value(expr.expr)?.members?.get(stringValue(expr.index));
    }
    return literal(expr, (value) => this.valueReference(value));
  }
  private valueReference(expr: AstExpr): Shape | undefined {
    if (expr instanceof AstExprLocal || expr instanceof AstExprGlobal || expr instanceof AstExprIndexName || expr instanceof AstExprIndexExpr) return this.value(expr);
    return undefined;
  }
  private ambientLocal(name: string) {
    const local = this.ambient?.get(name);
    const binding = this.contextLocals.get(name);
    // An evaluator parameter shadows a same-named outer script local.
    // A separately read inner local still wins by its actual declaration.
    return local && (!binding || local.declarationFrom >= binding.from) ? local : undefined;
  }
  private global(name: string): Shape | undefined {
    const local = this.ambientLocal(name);
    if (local) return this.localValues.get(local.declarationFrom);
    const binding = this.contextLocals.get(name);
    if (binding) return binding.value;
    return this.cursor < 0 ? this.globals.initial(name) : this.globals.get(name);
  }
  private setLocal(local: AstLocal, value: Shape | undefined) {
    const offset = this.read.offset(local.location.begin.line, local.location.begin.column);
    this.localOffsets.set(offset, local);
    this.localValues.set(offset, value);
    this.locals.set(local, value);
  }
  private globalTarget(name: string) {
    return (value: Shape | undefined) => {
      const local = this.ambientLocal(name);
      if (local) {
        this.localValues.set(local.declarationFrom, value);
        const identity = this.localOffsets.get(local.declarationFrom);
        if (identity) this.locals.set(identity, value);
        return;
      }
      const binding = this.contextLocals.get(name);
      if (binding) {
        binding.value = value;
        return;
      }
      if (this.cursor < 0) this.globals.set(name, value);
      else this.globals.assign(name, value);
    };
  }
  assign(target: AstExpr, value: Shape | undefined) {
    this.target(target)(value);
  }
  private target(target: AstExpr): (value: Shape | undefined) => void {
    if (target instanceof AstExprLocal) {
      const local = this.visibleLocal(target.local);
      return local ? (value) => { this.setLocal(local, value); } : this.globalTarget(target.local.name);
    }
    if (target instanceof AstExprGlobal) return this.globalTarget(target.name);
    if (target instanceof AstExprIndexName || (target instanceof AstExprIndexExpr && target.index instanceof AstExprConstantString)) {
      const members = this.value(target.expr)?.members;
      const key = target instanceof AstExprIndexName ? target.index : stringValue(target.index as AstExprConstantString);
      return (value) => { members?.set(key, value); };
    }
    return () => {};
  }
  private expression(expr: AstExpr) {
    visitAst(expr, { visit: (node) => {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstExprFunction) {
        if (this.contains(node.location)) {
          if (node.self) this.setLocal(node.self, undefined);
          node.args.forEach((arg) => this.setLocal(arg, undefined));
          this.run(node.body);
        }
        return false;
      }
      return true;
    } });
  }
  runOutside(context: OutsideContext, ambient: ReadonlyMap<string, { declarationFrom: number }>) {
    // A separate reading has its own locals. Only bindings visible before
    // its root come from the surrounding unit; later shadows remain local
    // to that reading rather than replacing earlier initializer references.
    this.ambient = ambient;
    // These are actual runtime parameters, with unknown receiver shapes.
    // They belong to this request only; cached ASTs/shapes are never mutated.
    // Actual AST locals/parameters above retain their binding identities.
    for (const name of context.bindings) this.contextLocals.set(name, { value: undefined, from: context.from });
    if (context.expr) this.expression(context.expr);
  }
  run(stat: AstStat) {
    const start = this.read.offset(stat.location.begin.line, stat.location.begin.column);
    const end = this.read.offset(stat.location.end.line, stat.location.end.column);
    if (start > this.cursor || (this.inFlow && !this.activeSection(stat.location))) return;
    if (stat instanceof AstStatBlock) {
      for (const child of stat.body) this.run(child);
    } else if (stat instanceof AstStatSparkdownExplicit) this.run(stat.statement);
    else if (stat instanceof AstStatLocal || stat instanceof AstStatSparkdownStore) {
      for (const value of stat.values) this.expression(value);
      // Stores were already initialized at story start. Replaying a literal
      // here would replace its table and detach aliases declared after cursor.
      // Still traverse values above for a cursor inside a stored function.
      if (stat instanceof AstStatLocal && end <= this.cursor) {
        const values = stat.values.map((expr) => this.value(expr));
        stat.vars.forEach((variable, index) => {
          if (variable instanceof AstLocal) this.setLocal(variable, values[index]);
          else this.assign(variable, values[index]);
        });
      }
    } else if (stat instanceof AstStatAssign) {
      stat.values.forEach((expr) => this.expression(expr));
      if (end <= this.cursor) {
        // Luau evaluates property receivers/keys before any assignment write.
        const targets = stat.vars.map((variable) => this.target(variable));
        const values = stat.values.map((expr) => this.value(expr));
        targets.forEach((target, index) => target(values[index]));
      }
    } else if (stat instanceof AstStatFunction || stat instanceof AstStatLocalFunction) {
      if (stat instanceof AstStatFunction) this.assign(stat.name, FUNCTION);
      else this.setLocal(stat.name, FUNCTION);
      this.expression(stat.func);
    } else if (stat instanceof AstStatIf) {
      this.expression(stat.condition);
      if (this.contains(stat.thenbody.location)) this.run(stat.thenbody);
      if (stat.elsebody && this.contains(stat.elsebody.location)) this.run(stat.elsebody);
    } else if (stat instanceof AstStatWhile || stat instanceof AstStatRepeat || stat instanceof AstStatFor || stat instanceof AstStatForIn) {
      if (this.contains(stat.location)) this.run(stat.body);
    } else if (stat instanceof AstStatError) {
      stat.expressions.forEach((expr) => this.expression(expr));
      stat.statements.forEach((child) => this.run(child));
    } else {
      visitAst(stat, { visit: (node) => {
        if (node instanceof AstType || node instanceof AstTypePack) return false;
        if (node instanceof AstExprFunction) {
          if (this.contains(node.location)) this.run(node.body);
          return false;
        }
        return true;
      } });
    }
  }
}

/** Undefined outside a member slot; an empty list for a member of unknown shape. */
export function getStaticMemberCompletions(
  document: SparkdownDocument, tree: Tree, scripts: Map<string, AnnotatedScript>, cursor: number,
): CompletionItem[] | undefined {
  const text = document.getText();
  const line = text.slice(text.lastIndexOf("\n", cursor - 1) + 1, cursor);
  // A cheap admission check. The AST below decides whether this is an
  // actual member slot, excluding numeric dots, annotations and prose.
  if (!/[.:][ \t]*[A-Za-z_0-9]*$|\[[ \t]*["'][^\n]*$/.test(line)) return undefined;
  const current = reading(tree, text);
  const unitSite = memberSite(current, cursor);
  const outside = unitSite ? undefined : outsideSite(current, tree, cursor);
  const site = outside?.site ?? unitSite;
  if (!site) return undefined;
  // A lazy foreign owner may be needed while initializing a current store's
  // alias. Its other declarations must not replace any current stored global,
  // including one whose source declaration lies after the request cursor.
  const currentStores = new Set<string>();
  for (const store of current.stores) {
    for (const variable of store.vars) {
      if (variable instanceof AstExprGlobal) currentStores.add(variable.name);
    }
  }
  const copies = new Map<Shape, Shape>();
  const foreign = new Map<string, Set<AnnotatedScript>>();
  const indexed: { script?: AnnotatedScript; index: DefineIndex }[] = [];
  const types = new Set<string>();
  const parents = new Map<string, string>();
  const includeIndex = (script: AnnotatedScript | undefined, index: DefineIndex) => {
    indexed.push({ script, index });
    index.types.forEach((name) => types.add(name));
    for (const header of index.headers) if (header.parent) parents.set(header.name, header.parent);
  };
  includeIndex(undefined, defineIndex(tree, text));
  const addOwner = (name: string, script: AnnotatedScript) => {
    const owners = foreign.get(name) ?? new Set<AnnotatedScript>();
    owners.add(script);
    foreign.set(name, owners);
  };
  for (const [uri, script] of scripts) {
    if (uri === document.uri || !script.tree) continue;
    // Only syntax headers and explicit type uses are indexed here; foreign
    // ASTs and property literals remain lazy until their owner is requested.
    includeIndex(script, defineIndex(script.tree, script.read(0, script.tree.length)));
    const declarations = script.annotations.declarations?.iter();
    while (declarations?.value) {
      const type = declarations.value.type;
      if (type === "var" || type === "function") addOwner(script.read(declarations.from, declarations.to), script);
      declarations.next();
    }
  }
  const ancestors = new Map<string, string[]>();
  const ancestorNames = (name: string): string[] => {
    const previous = ancestors.get(name);
    if (previous) return previous;
    const seen = new Set<string>();
    for (let parent: string | undefined = name; parent && !seen.has(parent); parent = parents.get(parent)) seen.add(parent);
    const result = [...seen];
    ancestors.set(name, result);
    return result;
  };
  for (const { script, index } of indexed) {
    if (!script) continue;
    for (const header of index.headers) {
      if (!header.parent || types.has(header.name)) addOwner(header.name, script);
      if (header.parent) for (const parent of ancestorNames(header.parent)) addOwner(parent, script);
    }
  }
  const loaded = new Set<Tree>([tree]);
  const globals = new Globals((name) => {
    // Expand existing namespace tables, but keep the previous winner rule
    // for a current script's already-bound store or reassigned global.
    if (globals.has(name) && (!namespaces.has(name) || globals.peek(name) !== namespaces.get(name))) return;
    // Other documents contribute globals, never their locals. Their existing
    // declaration ranges and syntax headers choose candidate owners without
    // constructing every document's AST or reading its property expressions.
    for (const script of foreign.get(name) ?? []) {
      if (!script.tree || loaded.has(script.tree)) continue;
      loaded.add(script.tree);
      initialize(reading(script.tree, script.read(0, script.tree.length)));
    }
  });
  const namespaces = new Map<string, Shape>();
  const namespace = (name: string): Shape => {
    let shape = namespaces.get(name);
    if (!shape) {
      shape = { members: new Map() };
      namespaces.set(name, shape);
    }
    return shape;
  };
  function initialize(read: Reading) {
    for (const name of read.functions) {
      if ((read === current || !currentStores.has(name)) && !globals.has(name)) globals.set(name, FUNCTION);
    }
    // Copies preserve aliases/cycles without mutating the cached literals.
    const defines = read.defines.map((definition) => {
      let shape = copyShape(definition.shape, copies);
      // Match the compiler's whole-program leaf/type classification. A leaf
      // remains parent-qualified, leaving its bare name free for user stores.
      if (!definition.parent || types.has(definition.name)) {
        const target = namespace(definition.name);
        shape.members?.forEach((value, key) => target.members!.set(key, value));
        shape = target;
        copies.set(definition.shape, shape);
        if (read === current || !currentStores.has(definition.name)) globals.set(definition.name, shape);
      }
      return { ...definition, shape };
    });
    for (const definition of defines) {
      if (!definition.parent) continue;
      // __def registers each instance in its declared parent and every
      // authored ancestor. This adds membership, not inherited field types.
      for (const parent of ancestorNames(definition.parent)) {
        const target = namespace(parent);
        target.members!.set(definition.name, definition.shape);
        if (!globals.has(parent)) globals.set(parent, target);
      }
    }
    // Stores initialize at story start, including those after the cursor.
    const inventory = new Inventory(globals, read, -1);
    for (const store of read.stores) {
      store.vars.forEach((variable, index) => {
        if (read !== current && variable instanceof AstExprGlobal && currentStores.has(variable.name)) return;
        inventory.assign(variable, store.values[index] ? inventory.value(store.values[index]!) : undefined);
      });
    }
  }
  initialize(current);
  const inventory = new Inventory(globals, current, cursor);
  inventory.run(current.units.prelude.root);
  for (const unit of current.units.flows) inventory.runFlow(unit.root);
  const currentScript = scripts.get(document.uri);
  const scopeScripts = new Map<string, AnnotatedScript>(currentScript ? [[document.uri, currentScript]] : []);
  for (const context of outside?.contexts ?? []) {
    const ambient = getDeclarationScopeInfo(scopeScripts, { uri: document.uri, offset: context.from }).visibleLocals;
    inventory.runOutside(context, ambient);
  }
  const shape = inventory.value(site.receiver);
  const items: CompletionItem[] = [];
  for (const [name, value] of shape?.members ?? []) {
    if (site.colon && !value?.callable) continue;
    if (!site.quote && (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name) || RESERVED.has(name))) continue;
    const inserted = site.quote
      ? name.replaceAll("\\", "\\\\").replaceAll(site.quote, "\\" + site.quote).replaceAll("\n", "\\n").replaceAll("\r", "\\r")
      : name;
    items.push({ label: name, kind: value?.callable ? CompletionItemKind.Method : CompletionItemKind.Property,
      textEdit: { range: document.range(site.from, site.to), newText: inserted } });
  }
  return items;
}
