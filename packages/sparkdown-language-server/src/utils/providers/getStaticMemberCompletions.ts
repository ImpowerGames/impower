import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { findOwnDeclarationName } from "@impower/sparkdown/src/compiler/lower/utils/findOwnDeclarationName";
import {
  AstExpr, AstExprConstantString, AstExprFunction, AstExprGlobal, AstExprGroup,
  AstExprIndexExpr, AstExprIndexName, AstExprLocal, AstExprTable, AstLocal,
  AstStat, AstStatAssign, AstStatBlock, AstStatError, AstStatFor, AstStatForIn,
  AstStatFunction, AstStatIf, AstStatLocal, AstStatLocalFunction, AstStatRepeat,
  AstStatSparkdownExplicit, AstStatSparkdownStore, AstStatWhile, AstType,
  AstTypePack, visitAst, type AstVisitor,
} from "@impower/sparkdown/src/compiler/typecheck/Ast";
import { type Location } from "@impower/sparkdown/src/compiler/typecheck/Location";
import {
  readLuauExpression, readLuauUnits, type LuauAstUnits,
} from "@impower/sparkdown/src/compiler/typecheck/readLuauAst";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";
import { type AnnotatedScript } from "../annotations/getDeclarationScopes";

// This is a syntax inventory, not inferred types. Only literal table keys,
// assignments, aliases and declared functions contribute members. Calls,
// annotations, metatables and compatibility judgments belong to the checker.
interface Shape {
  members?: Map<string, Shape | undefined>;
  callable?: boolean;
}
const FUNCTION: Shape = { callable: true };
class Globals extends Map<string, Shape | undefined> {
  constructor(private readonly load: (name: string) => void) { super(); }
  override get(name: string): Shape | undefined {
    if (!this.has(name)) this.load(name);
    return super.get(name);
  }
}
interface Reading {
  text: string;
  units: LuauAstUnits;
  defines: Map<string, Shape>;
  stores: AstStatSparkdownStore[];
  sites: Site[];
  offset(line: number, column: number): number;
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

function reading(tree: Tree, text: string): Reading {
  const previous = readings.get(tree);
  if (previous?.text === text) return previous;
  const lines = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) lines.push(at + 1);
  const result: Reading = {
    text, units: readLuauUnits(tree, text), defines: new Map(), stores: [], sites: [],
    offset: (line, column) => (lines[line] ?? text.length) + column,
  };
  result.sites = memberSites(result);
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
            const assignment = getDescendent("LuauVariableAssignment", child);
            const key = assignment && getDescendent("LuauVariableName", assignment);
            if (key) {
              const operation = getDescendent("LuauAssignmentOperation", child);
              const values: SyntaxNode[] = [];
              const content = operation?.getChild("LuauAssignmentOperation_content");
              for (let value = content?.firstChild; value; value = value.nextSibling) {
                if (value.name !== "LuauAssignmentOperator") values.push(value);
              }
              const expr = values.length ? readLuauExpression(values, text).expr : undefined;
              members.set(text.slice(key.from, key.to), literal(expr));
            }
          } else if (child.name === "LuauMethodDefinition" || child.name === "LuauFunctionDefinition") {
            const header = child.name === "LuauFunctionDefinition" ? findOwnDeclarationName(child) : child;
            const key = header && getDescendent("LuauFunctionName", header);
            if (key) members.set(text.slice(key.from, key.to), FUNCTION);
          }
        }
        result.defines.set(text.slice(name.from, name.to), { members });
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

function memberSites(read: Reading): Site[] {
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
  for (const unit of [read.units.prelude, ...read.units.flows]) visitAst(unit.root, visitor);
  return sites.sort((a, b) => a.start - b.start);
}

function memberSite(read: Reading, cursor: number): Site | undefined {
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
  constructor(readonly globals: Globals, readonly read: Reading, readonly cursor: number) {}
  contains(location: Location) {
    return this.read.offset(location.begin.line, location.begin.column) <= this.cursor &&
      this.read.offset(location.end.line, location.end.column) >= this.cursor;
  }
  value(expr: AstExpr): Shape | undefined {
    if (expr instanceof AstExprLocal) return this.locals.get(expr.local);
    if (expr instanceof AstExprGlobal) return this.globals.get(expr.name);
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
  assign(target: AstExpr, value: Shape | undefined) {
    if (target instanceof AstExprLocal) this.locals.set(target.local, value);
    else if (target instanceof AstExprGlobal) this.globals.set(target.name, value);
    else if (target instanceof AstExprIndexName) this.value(target.expr)?.members?.set(target.index, value);
    else if (target instanceof AstExprIndexExpr && target.index instanceof AstExprConstantString) {
      this.value(target.expr)?.members?.set(stringValue(target.index), value);
    }
  }
  private expression(expr: AstExpr) {
    visitAst(expr, { visit: (node) => {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstExprFunction) {
        if (this.contains(node.location)) this.run(node.body);
        return false;
      }
      return true;
    } });
  }
  run(stat: AstStat) {
    const start = this.read.offset(stat.location.begin.line, stat.location.begin.column);
    const end = this.read.offset(stat.location.end.line, stat.location.end.column);
    if (start > this.cursor) return;
    if (stat instanceof AstStatBlock) {
      for (const child of stat.body) this.run(child);
    } else if (stat instanceof AstStatSparkdownExplicit) this.run(stat.statement);
    else if (stat instanceof AstStatLocal || stat instanceof AstStatSparkdownStore) {
      for (const value of stat.values) this.expression(value);
      if (end <= this.cursor) {
        const values = stat.values.map((expr) => this.value(expr));
        stat.vars.forEach((variable, index) => {
          if (variable instanceof AstLocal) this.locals.set(variable, values[index]);
          else this.assign(variable, values[index]);
        });
      }
    } else if (stat instanceof AstStatAssign) {
      stat.values.forEach((expr) => this.expression(expr));
      if (end <= this.cursor) {
        const values = stat.values.map((expr) => this.value(expr));
        stat.vars.forEach((variable, index) => this.assign(variable, values[index]));
      }
    } else if (stat instanceof AstStatFunction || stat instanceof AstStatLocalFunction) {
      if (stat instanceof AstStatFunction) this.assign(stat.name, FUNCTION);
      else this.locals.set(stat.name, FUNCTION);
      if (this.contains(stat.func.location)) this.run(stat.func.body);
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
  const site = memberSite(current, cursor);
  if (!site) return undefined;
  const copies = new Map<Shape, Shape>();
  const foreign = new Map<string, AnnotatedScript[]>();
  for (const [uri, script] of scripts) {
    if (uri === document.uri || !script.tree) continue;
    const declarations = script.annotations.declarations?.iter();
    while (declarations?.value) {
      const type = declarations.value.type;
      if (type === "var" || type === "define") {
        const name = script.read(declarations.from, declarations.to);
        const owners = foreign.get(name) ?? [];
        owners.push(script);
        foreign.set(name, owners);
      }
      declarations.next();
    }
  }
  const loaded = new Set<Tree>([tree]);
  const globals = new Globals((name) => {
    // Other documents contribute globals, never their locals. Their existing
    // declaration ranges choose candidate owners without reading every body.
    for (const script of foreign.get(name) ?? []) {
      if (!script.tree || loaded.has(script.tree)) continue;
      loaded.add(script.tree);
      initialize(reading(script.tree, script.read(0, script.tree.length)));
    }
  });
  function initialize(read: Reading) {
    // Copies preserve aliases/cycles without mutating the cached literals.
    read.defines.forEach((shape, name) => globals.set(name, copyShape(shape, copies)));
    // Stores initialize at story start, including those after the cursor.
    const inventory = new Inventory(globals, read, -1);
    for (const store of read.stores) {
      store.vars.forEach((variable, index) => inventory.assign(variable, store.values[index] ? inventory.value(store.values[index]!) : undefined));
    }
  }
  initialize(current);
  const inventory = new Inventory(globals, current, cursor);
  for (const unit of [current.units.prelude, ...current.units.flows]) inventory.run(unit.root);
  const shape = inventory.value(site.receiver);
  const items: CompletionItem[] = [];
  for (const [name, value] of shape?.members ?? []) {
    if (site.colon && !value?.callable) continue;
    if (!site.quote && !/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) continue;
    const inserted = site.quote
      ? name.replaceAll("\\", "\\\\").replaceAll(site.quote, "\\" + site.quote).replaceAll("\n", "\\n").replaceAll("\r", "\\r")
      : name;
    items.push({ label: name, kind: value?.callable ? CompletionItemKind.Method : CompletionItemKind.Property,
      textEdit: { range: document.range(site.from, site.to), newText: inserted } });
  }
  return items;
}
