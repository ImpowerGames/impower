// A canonical text of a Luau syntax tree (`Ast.ts`), without locations, so
// two trees read from the same Luau by different readers can be compared as
// text: the tree `readLuauAst.ts` reads from Sparkdown's syntax tree, and the
// tree the port of Luau's parser reads from the text (#1285).
//
// Each node is a line, indented by its depth, naming its kind and the fields
// that are not children or locations; its children follow on lines of their
// own. A local is printed with a number that names its declaration, in the
// order the declarations are printed, so a name's resolution is part of the
// text: `x#1` is the second local declared, wherever it is used.

import {
  AstAttr,
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
  AstExprInstantiate,
  AstExprInterpString,
  AstExprLocal,
  AstExprSparkdownCallShorthand,
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownFlowArgument,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprSparkdownSequentialAlternator,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  AstGenericType,
  AstGenericTypePack,
  AstLocal,
  AstNode,
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
  AstStatCompoundAssign,
  AstStatContinue,
  AstStatDeclareExternType,
  AstStatDeclareFunction,
  AstStatDeclareGlobal,
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
  AstStatSparkdownChoose,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  AstStatTypeAlias,
  AstStatTypeFunction,
  AstStatWhile,
  AstType,
  AstTypeError,
  AstTypeFunction,
  AstTypeGroup,
  AstTypeIntersection,
  AstTypeOptional,
  AstTypePack,
  AstTypePackExplicit,
  AstTypePackGeneric,
  AstTypePackVariadic,
  AstTypeReference,
  AstTypeSingletonBool,
  AstTypeSingletonString,
  AstTypeTable,
  AstTypeTypeof,
  AstTypeUnion,
  binaryOpToString,
  QuoteStyle,
  TableItemKind,
  unaryOpToString,
  type AstTableAccess,
  type AstTypeList,
  type AstTypeOrPack,
} from "./Ast";

/**
 * Nodes to print in place of others: for a node, the node or nodes printed
 * instead (several only for a statement of a block), or undefined to print
 * it as it is. A comparison of two readings that differ by design, such as
 * Sparkdown's own constructs, which Luau's parser reads as something else,
 * prints one reading's nodes as the other reads them.
 */
export type AstSubstitution = (node: AstNode) => AstNode | AstNode[] | undefined;

/** The canonical text of a tree. */
export function printAst(node: AstNode, substitute?: AstSubstitution): string {
  const printer = new Printer(substitute);
  printer.node(node, 0);
  return printer.lines.join("\n");
}

const QUOTE_STYLES: Record<QuoteStyle, string> = {
  [QuoteStyle.QuotedSimple]: "quoted",
  [QuoteStyle.QuotedSingle]: "single",
  [QuoteStyle.QuotedRaw]: "raw",
  [QuoteStyle.Unquoted]: "unquoted",
};

const TABLE_ITEM_KINDS: Record<TableItemKind, string> = {
  [TableItemKind.List]: "list",
  [TableItemKind.Record]: "record",
  [TableItemKind.General]: "general",
};

/** A string as a JSON string literal, which spells every character, control characters included, in source form. */
function quote(value: string): string {
  return JSON.stringify(value);
}

function access(value: AstTableAccess): string {
  return value === 1 ? "read " : value === 2 ? "write " : "";
}

class Printer {
  readonly lines: string[] = [];
  private readonly localIds = new Map<AstLocal, number>();

  constructor(private readonly substitute: AstSubstitution | undefined) {}

  /** The nodes printed for a node: itself, or what `substitute` gives for it. */
  private substitutes(node: AstNode): AstNode[] {
    const replaced = this.substitute?.(node);
    if (replaced === undefined) return [node];
    return Array.isArray(replaced) ? replaced : [replaced];
  }

  private line(depth: number, text: string): void {
    this.lines.push(`${"  ".repeat(depth)}${text}`);
  }

  private local(local: AstLocal): string {
    let id = this.localIds.get(local);
    if (id === undefined) {
      id = this.localIds.size;
      this.localIds.set(local, id);
    }
    return `${local.name}#${id}`;
  }

  /** A local's declaration: its name and number, where it was declared, and its annotation on the lines after. */
  private declare(local: AstLocal, depth: number): void {
    const shadow = local.shadow ? ` shadows ${this.local(local.shadow)}` : "";
    const flags = `${local.isConst ? " const" : ""}${local.isExported ? " exported" : ""}`;
    this.line(depth, `local ${this.local(local)} function=${local.functionDepth} loop=${local.loopDepth}${flags}${shadow}`);
    if (local.annotation) this.node(local.annotation, depth + 1);
  }

  private typeList(label: string, list: AstTypeList, depth: number): void {
    this.line(depth, label);
    for (const t of list.types) this.node(t, depth + 1);
    if (list.tailType) {
      this.line(depth + 1, "tail");
      this.node(list.tailType, depth + 2);
    }
  }

  private typeOrPacks(label: string, items: AstTypeOrPack[], depth: number): void {
    if (items.length === 0) return;
    this.line(depth, label);
    for (const item of items) {
      if (item.type) this.node(item.type, depth + 1);
      else if (item.typePack) this.node(item.typePack, depth + 1);
      else this.line(depth + 1, "(none)");
    }
  }

  private generics(generics: AstGenericType[], packs: AstGenericTypePack[], depth: number): void {
    for (const g of generics) this.node(g, depth);
    for (const g of packs) this.node(g, depth);
  }

  private attributes(attributes: AstAttr[], depth: number): void {
    for (const a of attributes) this.node(a, depth);
  }

  private optional(label: string, node: AstNode | undefined, depth: number): void {
    if (!node) return;
    this.line(depth, label);
    this.node(node, depth + 1);
  }

  private statement(stat: AstStat, text: string, depth: number): void {
    this.line(depth, `${text}${stat.hasSemicolon ? " ;" : ""}`);
  }

  node(original: AstNode, depth: number): void {
    const nodes = this.substitutes(original);
    // A substitute that is the node itself is printed as it is.
    if (nodes.length !== 1 || nodes[0] !== original) {
      for (const n of nodes) this.node(n, depth);
      return;
    }
    const node = original;
    const d = depth + 1;
    if (node instanceof AstExpr) this.expr(node, depth);
    else if (node instanceof AstStat) this.stat(node, depth);
    else if (node instanceof AstType) this.type(node, depth);
    else if (node instanceof AstTypePack) this.typePack(node, depth);
    else if (node instanceof AstGenericType) {
      this.line(depth, `GenericType ${node.name}`);
      this.optional("default", node.defaultValue, d);
    } else if (node instanceof AstGenericTypePack) {
      this.line(depth, `GenericTypePack ${node.name}`);
      this.optional("default", node.defaultValue, d);
    } else if (node instanceof AstAttr) {
      this.line(depth, `Attr ${node.type} ${node.name}`);
      for (const a of node.args) this.node(a, d);
    } else {
      this.line(depth, `(unknown ${node.kind})`);
    }
  }

  private expr(node: AstExpr, depth: number): void {
    const d = depth + 1;
    if (node instanceof AstExprGroup) {
      this.line(depth, "ExprGroup");
      this.node(node.expr, d);
    } else if (node instanceof AstExprConstantNil) {
      this.line(depth, "ExprConstantNil");
    } else if (node instanceof AstExprConstantBool) {
      this.line(depth, `ExprConstantBool ${node.value}`);
    } else if (node instanceof AstExprConstantNumber) {
      this.line(depth, `ExprConstantNumber ${Object.is(node.value, -0) ? "-0" : String(node.value)}${node.malformed ? " malformed" : ""}`);
    } else if (node instanceof AstExprConstantString) {
      this.line(depth, `ExprConstantString ${QUOTE_STYLES[node.quoteStyle]} ${quote(node.value)}`);
    } else if (node instanceof AstExprLocal) {
      this.line(depth, `ExprLocal ${this.local(node.local)}${node.upvalue ? " upvalue" : ""}`);
    } else if (node instanceof AstExprGlobal) {
      this.line(depth, `ExprGlobal ${node.name}`);
    } else if (node instanceof AstExprVarargs) {
      this.line(depth, "ExprVarargs");
    } else if (node instanceof AstExprCall) {
      this.line(depth, `ExprCall${node.self ? " self" : ""}`);
      this.node(node.func, d);
      this.typeOrPacks("typeArguments", node.typeArguments, d);
      for (const a of node.args) this.node(a, d);
    } else if (node instanceof AstExprIndexName) {
      this.line(depth, `ExprIndexName ${node.op}${node.index}`);
      this.node(node.expr, d);
    } else if (node instanceof AstExprIndexExpr) {
      this.line(depth, "ExprIndexExpr");
      this.node(node.expr, d);
      this.node(node.index, d);
    } else if (node instanceof AstExprFunction) {
      this.line(depth, `ExprFunction ${quote(node.debugname)} depth=${node.functionDepth}${node.vararg ? " vararg" : ""}${node.argLocation ? " parens" : ""}`);
      this.attributes(node.attributes, d);
      this.generics(node.generics, node.genericPacks, d);
      if (node.self) this.declare(node.self, d);
      for (const a of node.args) this.declare(a, d);
      this.optional("vararg", node.varargAnnotation, d);
      this.optional("returns", node.returnAnnotation, d);
      this.node(node.body, d);
    } else if (node instanceof AstExprTable) {
      this.line(depth, "ExprTable");
      for (const item of node.items) {
        this.line(d, TABLE_ITEM_KINDS[item.kind]);
        if (item.key) this.node(item.key, d + 1);
        this.node(item.value, d + 1);
      }
    } else if (node instanceof AstExprUnary) {
      this.line(depth, `ExprUnary ${unaryOpToString(node.op)}`);
      this.node(node.expr, d);
    } else if (node instanceof AstExprBinary) {
      this.line(depth, `ExprBinary ${binaryOpToString(node.op)}`);
      this.node(node.left, d);
      this.node(node.right, d);
    } else if (node instanceof AstExprTypeAssertion) {
      this.line(depth, "ExprTypeAssertion");
      this.node(node.expr, d);
      this.node(node.annotation, d);
    } else if (node instanceof AstExprIfElse) {
      this.line(depth, `ExprIfElse${node.hasThen ? "" : " no-then"}${node.hasElse ? "" : " no-else"}`);
      this.node(node.condition, d);
      this.node(node.trueExpr, d);
      this.node(node.falseExpr, d);
    } else if (node instanceof AstExprInterpString) {
      this.line(depth, `ExprInterpString ${node.strings.map(quote).join(" ")}`);
      for (const e of node.expressions) this.node(e, d);
    } else if (node instanceof AstExprInstantiate) {
      this.line(depth, "ExprInstantiate");
      this.node(node.expr, d);
      this.typeOrPacks("typeArguments", node.typeArguments, d);
    } else if (node instanceof AstExprError) {
      this.line(depth, "ExprError");
      for (const e of node.expressions) this.node(e, d);
    } else if (node instanceof AstExprSparkdownDivertTarget) {
      this.line(depth, `SparkdownDivertTarget ${quote(node.path)}`);
    } else if (node instanceof AstExprSparkdownRegex) {
      this.line(depth, `SparkdownRegex ${quote(node.pattern)} ${quote(node.flags)}`);
    } else if (node instanceof AstExprSparkdownConditionalAlternator) {
      this.line(depth, `SparkdownConditionalAlternator ${node.source.name}`);
    } else if (node instanceof AstExprSparkdownSequentialAlternator) {
      this.line(depth, `SparkdownSequentialAlternator ${node.source.name}`);
    } else if (node instanceof AstExprSparkdownNew) {
      this.line(depth, `SparkdownNew ${node.className}${node.hasArgs ? " call" : ""}`);
      for (const a of node.args) this.node(a, d);
    } else if (node instanceof AstExprSparkdownCallShorthand) {
      this.line(depth, "SparkdownCallShorthand");
      this.node(node.expr, d);
    } else if (node instanceof AstExprSparkdownInterpString) {
      this.line(depth, `SparkdownInterpString ${node.strings.map(quote).join(" ")}`);
      for (const e of node.expressions) this.node(e, d);
    } else if (node instanceof AstExprSparkdownFlowArgument) {
      this.line(depth, "SparkdownFlowArgument");
    } else {
      this.line(depth, `(unknown ${node.kind})`);
    }
  }

  private stat(node: AstStat, depth: number): void {
    const d = depth + 1;
    if (node instanceof AstStatBlock) {
      this.statement(node, `StatBlock${node.hasEnd ? "" : " no-end"}`, depth);
      for (const s of node.body) this.node(s, d);
    } else if (node instanceof AstStatIf) {
      this.statement(node, "StatIf", depth);
      this.node(node.condition, d);
      this.node(node.thenbody, d);
      this.optional("else", node.elsebody, d);
    } else if (node instanceof AstStatWhile) {
      this.statement(node, `StatWhile${node.hasDo ? "" : " no-do"}`, depth);
      this.node(node.condition, d);
      this.node(node.body, d);
    } else if (node instanceof AstStatRepeat) {
      this.statement(node, "StatRepeat", depth);
      this.node(node.body, d);
      this.node(node.condition, d);
    } else if (node instanceof AstStatBreak) {
      this.statement(node, "StatBreak", depth);
    } else if (node instanceof AstStatContinue) {
      this.statement(node, "StatContinue", depth);
    } else if (node instanceof AstStatReturn) {
      this.statement(node, "StatReturn", depth);
      for (const e of node.list) this.node(e, d);
    } else if (node instanceof AstStatExpr) {
      this.statement(node, "StatExpr", depth);
      this.node(node.expr, d);
    } else if (node instanceof AstStatLocal) {
      this.statement(node, `StatLocal${node.isConst ? " const" : ""}${node.isExported ? " exported" : ""}${node.equalsSignLocation ? " =" : ""}`, depth);
      for (const v of node.values) this.node(v, d);
      for (const v of node.vars) this.declare(v, d);
    } else if (node instanceof AstStatFor) {
      this.statement(node, `StatFor${node.hasDo ? "" : " no-do"}`, depth);
      this.node(node.from, d);
      this.node(node.to, d);
      this.optional("step", node.step, d);
      this.declare(node.variable, d);
      this.node(node.body, d);
    } else if (node instanceof AstStatForIn) {
      this.statement(node, `StatForIn${node.hasIn ? "" : " no-in"}${node.hasDo ? "" : " no-do"}`, depth);
      for (const v of node.values) this.node(v, d);
      for (const v of node.vars) this.declare(v, d);
      this.node(node.body, d);
    } else if (node instanceof AstStatAssign) {
      this.statement(node, "StatAssign", depth);
      for (const v of node.vars) this.node(v, d);
      this.line(d, "=");
      for (const v of node.values) this.node(v, d);
    } else if (node instanceof AstStatCompoundAssign) {
      this.statement(node, `StatCompoundAssign ${binaryOpToString(node.op)}=`, depth);
      this.node(node.variable, d);
      this.node(node.value, d);
    } else if (node instanceof AstStatFunction) {
      this.statement(node, "StatFunction", depth);
      this.node(node.name, d);
      this.node(node.func, d);
    } else if (node instanceof AstStatLocalFunction) {
      this.statement(node, `StatLocalFunction${node.isConst ? " const" : ""}`, depth);
      this.declare(node.name, d);
      this.node(node.func, d);
    } else if (node instanceof AstStatTypeAlias) {
      this.statement(node, `StatTypeAlias ${node.name}${node.exported ? " exported" : ""}`, depth);
      this.generics(node.generics, node.genericPacks, d);
      this.node(node.type, d);
    } else if (node instanceof AstStatTypeFunction) {
      this.statement(node, `StatTypeFunction ${node.name}${node.exported ? " exported" : ""}`, depth);
      this.node(node.body, d);
    } else if (node instanceof AstStatDeclareGlobal) {
      this.statement(node, `StatDeclareGlobal ${node.name}`, depth);
      this.node(node.type, d);
    } else if (node instanceof AstStatDeclareFunction) {
      this.statement(node, `StatDeclareFunction ${node.name}${node.vararg ? " vararg" : ""}`, depth);
      this.attributes(node.attributes, d);
      this.generics(node.generics, node.genericPacks, d);
      this.typeList("params", node.params, d);
      this.line(d, `names ${node.paramNames.map((n) => n.name).join(" ")}`);
      this.node(node.retTypes, d);
    } else if (node instanceof AstStatDeclareExternType) {
      this.statement(node, `StatDeclareExternType ${node.name}${node.superName ? ` : ${node.superName}` : ""}`, depth);
      for (const p of node.props) {
        this.line(d, `${access(p.access)}${p.name}${p.isMethod ? " method" : ""}`);
        this.node(p.ty, d + 1);
      }
    } else if (node instanceof AstStatError) {
      this.statement(node, "StatError", depth);
      for (const e of node.expressions) this.node(e, d);
      for (const s of node.statements) this.node(s, d);
    } else if (node instanceof AstStatSparkdownExplicit) {
      this.statement(node, "SparkdownExplicit", depth);
      this.node(node.statement, d);
    } else if (node instanceof AstStatSparkdownStore) {
      this.statement(node, `SparkdownStore${node.equalsSignLocation ? " =" : ""}`, depth);
      node.vars.forEach((v, i) => {
        this.node(v, d);
        const annotation = node.annotations[i];
        if (annotation) this.node(annotation, d + 1);
      });
      for (const v of node.values) this.node(v, d);
    } else if (node instanceof AstStatSparkdownChoose) {
      this.statement(node, "SparkdownChoose", depth);
      this.node(node.body, d);
      this.optional("then", node.gather, d);
    } else {
      this.line(depth, `(unknown ${node.kind})`);
    }
  }

  private type(node: AstType, depth: number): void {
    const d = depth + 1;
    if (node instanceof AstTypeReference) {
      this.line(depth, `TypeReference ${node.prefix !== undefined ? `${node.prefix}.` : ""}${node.name}${node.hasParameterList ? " <>" : ""}`);
      this.typeOrPacks("parameters", node.parameters, d);
    } else if (node instanceof AstTypeTable) {
      this.line(depth, "TypeTable");
      for (const p of node.props) {
        this.line(d, `${access(p.access)}${p.name}`);
        this.node(p.type, d + 1);
      }
      if (node.indexer) {
        this.line(d, `${access(node.indexer.access)}indexer`);
        this.node(node.indexer.indexType, d + 1);
        this.node(node.indexer.resultType, d + 1);
      }
    } else if (node instanceof AstTypeFunction) {
      this.line(depth, "TypeFunction");
      this.attributes(node.attributes, d);
      this.generics(node.generics, node.genericPacks, d);
      this.typeList("args", node.argTypes, d);
      if (node.argNames.some((n) => n)) this.line(d, `names ${node.argNames.map((n) => n?.name ?? "_").join(" ")}`);
      this.node(node.returnTypes, d);
    } else if (node instanceof AstTypeTypeof) {
      this.line(depth, "TypeTypeof");
      this.node(node.expr, d);
    } else if (node instanceof AstTypeOptional) {
      this.line(depth, "TypeOptional");
    } else if (node instanceof AstTypeUnion) {
      this.line(depth, "TypeUnion");
      for (const t of node.types) this.node(t, d);
    } else if (node instanceof AstTypeIntersection) {
      this.line(depth, "TypeIntersection");
      for (const t of node.types) this.node(t, d);
    } else if (node instanceof AstTypeError) {
      this.line(depth, `TypeError${node.isMissing ? " missing" : ""}`);
      for (const t of node.types) this.node(t, d);
    } else if (node instanceof AstTypeSingletonBool) {
      this.line(depth, `TypeSingletonBool ${node.value}`);
    } else if (node instanceof AstTypeSingletonString) {
      this.line(depth, `TypeSingletonString ${quote(node.value)}`);
    } else if (node instanceof AstTypeGroup) {
      this.line(depth, "TypeGroup");
      this.node(node.type, d);
    } else {
      this.line(depth, `(unknown ${node.kind})`);
    }
  }

  private typePack(node: AstTypePack, depth: number): void {
    if (node instanceof AstTypePackExplicit) this.typeList("TypePackExplicit", node.typeList, depth);
    else if (node instanceof AstTypePackVariadic) {
      this.line(depth, "TypePackVariadic");
      this.node(node.variadicType, depth + 1);
    } else if (node instanceof AstTypePackGeneric) {
      this.line(depth, `TypePackGeneric ${node.genericName}`);
    } else {
      this.line(depth, `(unknown ${node.kind})`);
    }
  }
}
