// Luau's syntax tree, as `Ast/include/Luau/Ast.h` defines it; Luau is
// MIT-licensed (see `LICENSE-luau.txt`). The type checker's passes are ported
// from Luau and read this tree, which `readLuauAst.ts` builds from
// Sparkdown's syntax tree. Names are resolved when the tree is built: a name
// that refers to a local is an `AstExprLocal` pointing at its `AstLocal`, and
// any other name is an `AstExprGlobal`.

import type { Location, Position } from "./Location";

export class AstLocal {
  /** Set after construction when the local is exported. */
  isExported = false;

  constructor(
    public name: string,
    public location: Location,
    public shadow: AstLocal | undefined,
    public functionDepth: number,
    public loopDepth: number,
    public annotation: AstType | undefined,
    public isConst = false,
  ) {}
}

export abstract class AstNode {
  constructor(public location: Location) {}
  abstract readonly kind: string;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export abstract class AstExpr extends AstNode {}

export class AstExprGroup extends AstExpr {
  readonly kind = "ExprGroup";
  constructor(
    location: Location,
    public expr: AstExpr,
  ) {
    super(location);
  }
}

export class AstExprConstantNil extends AstExpr {
  readonly kind = "ExprConstantNil";
}

export class AstExprConstantBool extends AstExpr {
  readonly kind = "ExprConstantBool";
  constructor(
    location: Location,
    public value: boolean,
  ) {
    super(location);
  }
}

export class AstExprConstantNumber extends AstExpr {
  readonly kind = "ExprConstantNumber";
  constructor(
    location: Location,
    public value: number,
    public malformed = false,
  ) {
    super(location);
  }
}

export const enum QuoteStyle {
  QuotedSimple,
  QuotedSingle,
  QuotedRaw,
  Unquoted,
}

export class AstExprConstantString extends AstExpr {
  readonly kind = "ExprConstantString";
  /** @param value the string's bytes, one character per byte */
  constructor(
    location: Location,
    public value: string,
    public quoteStyle: QuoteStyle,
  ) {
    super(location);
  }

  isQuoted(): boolean {
    return this.quoteStyle === QuoteStyle.QuotedSimple || this.quoteStyle === QuoteStyle.QuotedRaw;
  }
}

export class AstExprLocal extends AstExpr {
  readonly kind = "ExprLocal";
  constructor(
    location: Location,
    public local: AstLocal,
    public upvalue: boolean,
  ) {
    super(location);
  }
}

export class AstExprGlobal extends AstExpr {
  readonly kind = "ExprGlobal";
  constructor(
    location: Location,
    public name: string,
  ) {
    super(location);
  }
}

export class AstExprVarargs extends AstExpr {
  readonly kind = "ExprVarargs";
}

export interface AstTypeOrPack {
  type?: AstType;
  typePack?: AstTypePack;
}

export class AstExprCall extends AstExpr {
  readonly kind = "ExprCall";
  constructor(
    location: Location,
    public func: AstExpr,
    public args: AstExpr[],
    public self: boolean,
    public typeArguments: AstTypeOrPack[],
    public argLocation: Location,
  ) {
    super(location);
  }
}

export class AstExprIndexName extends AstExpr {
  readonly kind = "ExprIndexName";
  constructor(
    location: Location,
    public expr: AstExpr,
    public index: string,
    public indexLocation: Location,
    public opPosition: Position,
    public op: "." | ":",
  ) {
    super(location);
  }
}

export class AstExprIndexExpr extends AstExpr {
  readonly kind = "ExprIndexExpr";
  constructor(
    location: Location,
    public expr: AstExpr,
    public index: AstExpr,
  ) {
    super(location);
  }
}

export const enum AstAttrType {
  Checked,
  Native,
  Deprecated,
  DebugNoinline,
  Unknown,
}

/** What a `@deprecated` attribute says (Luau's `AstAttr::DeprecatedInfo`). */
export interface DeprecatedInfo {
  deprecated: boolean;
  /** What to use instead. */
  use?: string;
  reason?: string;
}

export class AstAttr extends AstNode {
  readonly kind = "Attr";
  constructor(
    location: Location,
    public type: AstAttrType,
    public args: AstExpr[] = [],
    public name = "",
  ) {
    super(location);
  }

  deprecatedInfo(): DeprecatedInfo {
    const info: DeprecatedInfo = { deprecated: this.type === AstAttrType.Deprecated };
    const table = this.args[0];
    if (info.deprecated && table instanceof AstExprTable) {
      const use = table.getRecord("use");
      if (use instanceof AstExprConstantString) info.use = use.value;
      const reason = table.getRecord("reason");
      if (reason instanceof AstExprConstantString) info.reason = reason.value;
    }
    return info;
  }
}

export class AstGenericType extends AstNode {
  readonly kind = "GenericType";
  constructor(
    location: Location,
    public name: string,
    public defaultValue?: AstType,
  ) {
    super(location);
  }
}

export class AstGenericTypePack extends AstNode {
  readonly kind = "GenericTypePack";
  constructor(
    location: Location,
    public name: string,
    public defaultValue?: AstTypePack,
  ) {
    super(location);
  }
}

export class AstExprFunction extends AstExpr {
  readonly kind = "ExprFunction";
  constructor(
    location: Location,
    public attributes: AstAttr[],
    public generics: AstGenericType[],
    public genericPacks: AstGenericTypePack[],
    public self: AstLocal | undefined,
    public args: AstLocal[],
    public vararg: boolean,
    public varargLocation: Location,
    public body: AstStatBlock,
    public functionDepth: number,
    public debugname: string,
    public returnAnnotation: AstTypePack | undefined,
    public varargAnnotation: AstTypePack | undefined,
    public argLocation: Location | undefined,
  ) {
    super(location);
  }

  hasAttribute(type: AstAttrType): boolean {
    return this.attributes.some((a) => a.type === type);
  }

  getAttribute(type: AstAttrType): AstAttr | undefined {
    return this.attributes.find((a) => a.type === type);
  }
}

export const enum TableItemKind {
  /** `foo`; the key is absent. */
  List,
  /** `foo = bar`; the key is an `AstExprConstantString`. */
  Record,
  /** `[foo] = bar`. */
  General,
}

export interface AstExprTableItem {
  kind: TableItemKind;
  key: AstExpr | undefined;
  value: AstExpr;
}

export class AstExprTable extends AstExpr {
  readonly kind = "ExprTable";
  constructor(
    location: Location,
    public items: AstExprTableItem[],
  ) {
    super(location);
  }

  getRecord(key: string): AstExpr | undefined {
    for (const item of this.items) {
      if (item.kind === TableItemKind.Record && item.key instanceof AstExprConstantString && item.key.value === key) {
        return item.value;
      }
    }
    return undefined;
  }
}

export const enum UnaryOp {
  Not,
  Minus,
  Len,
}

export function unaryOpToString(op: UnaryOp): string {
  switch (op) {
    case UnaryOp.Minus:
      return "-";
    case UnaryOp.Not:
      return "not";
    case UnaryOp.Len:
      return "#";
  }
}

export class AstExprUnary extends AstExpr {
  readonly kind = "ExprUnary";
  constructor(
    location: Location,
    public op: UnaryOp,
    public expr: AstExpr,
  ) {
    super(location);
  }
}

export const enum BinaryOp {
  Add,
  Sub,
  Mul,
  Div,
  FloorDiv,
  Mod,
  Pow,
  Concat,
  CompareNe,
  CompareEq,
  CompareLt,
  CompareLe,
  CompareGt,
  CompareGe,
  And,
  Or,
}

export function binaryOpToString(op: BinaryOp): string {
  switch (op) {
    case BinaryOp.Add:
      return "+";
    case BinaryOp.Sub:
      return "-";
    case BinaryOp.Mul:
      return "*";
    case BinaryOp.Div:
      return "/";
    case BinaryOp.FloorDiv:
      return "//";
    case BinaryOp.Mod:
      return "%";
    case BinaryOp.Pow:
      return "^";
    case BinaryOp.Concat:
      return "..";
    case BinaryOp.CompareNe:
      return "~=";
    case BinaryOp.CompareEq:
      return "==";
    case BinaryOp.CompareLt:
      return "<";
    case BinaryOp.CompareLe:
      return "<=";
    case BinaryOp.CompareGt:
      return ">";
    case BinaryOp.CompareGe:
      return ">=";
    case BinaryOp.And:
      return "and";
    case BinaryOp.Or:
      return "or";
  }
}

export class AstExprBinary extends AstExpr {
  readonly kind = "ExprBinary";
  constructor(
    location: Location,
    public op: BinaryOp,
    public left: AstExpr,
    public right: AstExpr,
  ) {
    super(location);
  }
}

export class AstExprTypeAssertion extends AstExpr {
  readonly kind = "ExprTypeAssertion";
  constructor(
    location: Location,
    public expr: AstExpr,
    public annotation: AstType,
  ) {
    super(location);
  }
}

export class AstExprIfElse extends AstExpr {
  readonly kind = "ExprIfElse";
  constructor(
    location: Location,
    public condition: AstExpr,
    public hasThen: boolean,
    public trueExpr: AstExpr,
    public hasElse: boolean,
    public falseExpr: AstExpr,
  ) {
    super(location);
  }
}

export class AstExprInterpString extends AstExpr {
  readonly kind = "ExprInterpString";
  constructor(
    location: Location,
    public strings: string[],
    public expressions: AstExpr[],
  ) {
    super(location);
  }
}

export class AstExprInstantiate extends AstExpr {
  readonly kind = "ExprInstantiate";
  constructor(
    location: Location,
    public expr: AstExpr,
    public typeArguments: AstTypeOrPack[],
  ) {
    super(location);
  }
}

export class AstExprError extends AstExpr {
  readonly kind = "ExprError";
  constructor(
    location: Location,
    public expressions: AstExpr[],
    public messageIndex = 0,
  ) {
    super(location);
  }
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export abstract class AstStat extends AstNode {
  hasSemicolon = false;
}

export class AstStatBlock extends AstStat {
  readonly kind = "StatBlock";
  constructor(
    location: Location,
    public body: AstStat[],
    public hasEnd = true,
  ) {
    super(location);
  }
}

export class AstStatIf extends AstStat {
  readonly kind = "StatIf";
  constructor(
    location: Location,
    public condition: AstExpr,
    public thenbody: AstStatBlock,
    public elsebody: AstStat | undefined,
    public thenLocation: Location | undefined,
    public elseLocation: Location | undefined,
  ) {
    super(location);
  }
}

export class AstStatWhile extends AstStat {
  readonly kind = "StatWhile";
  constructor(
    location: Location,
    public condition: AstExpr,
    public body: AstStatBlock,
    public hasDo: boolean,
    public doLocation: Location,
  ) {
    super(location);
  }
}

export class AstStatRepeat extends AstStat {
  readonly kind = "StatRepeat";
  constructor(
    location: Location,
    public condition: AstExpr,
    public body: AstStatBlock,
  ) {
    super(location);
  }
}

export class AstStatBreak extends AstStat {
  readonly kind = "StatBreak";
}

export class AstStatContinue extends AstStat {
  readonly kind = "StatContinue";
}

export class AstStatReturn extends AstStat {
  readonly kind = "StatReturn";
  constructor(
    location: Location,
    public list: AstExpr[],
  ) {
    super(location);
  }
}

export class AstStatExpr extends AstStat {
  readonly kind = "StatExpr";
  constructor(
    location: Location,
    public expr: AstExpr,
  ) {
    super(location);
  }
}

export class AstStatLocal extends AstStat {
  readonly kind = "StatLocal";
  isExported = false;
  keywordLocation?: Location;

  constructor(
    location: Location,
    public vars: AstLocal[],
    public values: AstExpr[],
    public equalsSignLocation: Location | undefined,
    public isConst = false,
  ) {
    super(location);
  }
}

export class AstStatFor extends AstStat {
  readonly kind = "StatFor";
  constructor(
    location: Location,
    public variable: AstLocal,
    public from: AstExpr,
    public to: AstExpr,
    public step: AstExpr | undefined,
    public body: AstStatBlock,
    public hasDo: boolean,
    public doLocation: Location,
  ) {
    super(location);
  }
}

export class AstStatForIn extends AstStat {
  readonly kind = "StatForIn";
  constructor(
    location: Location,
    public vars: AstLocal[],
    public values: AstExpr[],
    public body: AstStatBlock,
    public hasIn: boolean,
    public inLocation: Location,
    public hasDo: boolean,
    public doLocation: Location,
  ) {
    super(location);
  }
}

export class AstStatAssign extends AstStat {
  readonly kind = "StatAssign";
  constructor(
    location: Location,
    public vars: AstExpr[],
    public values: AstExpr[],
  ) {
    super(location);
  }
}

export class AstStatCompoundAssign extends AstStat {
  readonly kind = "StatCompoundAssign";
  constructor(
    location: Location,
    public op: BinaryOp,
    public variable: AstExpr,
    public value: AstExpr,
  ) {
    super(location);
  }
}

export class AstStatFunction extends AstStat {
  readonly kind = "StatFunction";
  constructor(
    location: Location,
    public name: AstExpr,
    public func: AstExprFunction,
  ) {
    super(location);
  }
}

export class AstStatLocalFunction extends AstStat {
  readonly kind = "StatLocalFunction";
  constructor(
    location: Location,
    public name: AstLocal,
    public func: AstExprFunction,
    public isConst = false,
  ) {
    super(location);
  }
}

export class AstStatTypeAlias extends AstStat {
  readonly kind = "StatTypeAlias";
  constructor(
    location: Location,
    public name: string,
    public nameLocation: Location,
    public generics: AstGenericType[],
    public genericPacks: AstGenericTypePack[],
    public type: AstType,
    public exported: boolean,
  ) {
    super(location);
  }
}

export class AstStatTypeFunction extends AstStat {
  readonly kind = "StatTypeFunction";
  constructor(
    location: Location,
    public name: string,
    public nameLocation: Location,
    public body: AstExprFunction,
    public exported: boolean,
    /** Whether the declaration has parse errors, which keep a use of it from being evaluated. */
    public hasErrors: boolean,
  ) {
    super(location);
  }
}

export class AstStatDeclareGlobal extends AstStat {
  readonly kind = "StatDeclareGlobal";
  constructor(
    location: Location,
    public name: string,
    public nameLocation: Location,
    public type: AstType,
  ) {
    super(location);
  }
}

export interface AstArgumentName {
  name: string;
  location: Location;
}

export class AstStatDeclareFunction extends AstStat {
  readonly kind = "StatDeclareFunction";
  constructor(
    location: Location,
    public attributes: AstAttr[],
    public name: string,
    public nameLocation: Location,
    public generics: AstGenericType[],
    public genericPacks: AstGenericTypePack[],
    public params: AstTypeList,
    public paramNames: AstArgumentName[],
    public vararg: boolean,
    public varargLocation: Location,
    public retTypes: AstTypePack,
  ) {
    super(location);
  }

  isCheckedFunction(): boolean {
    return this.attributes.some((a) => a.type === AstAttrType.Checked);
  }
}

export const enum AstTableAccess {
  Read = 0b01,
  Write = 0b10,
  ReadWrite = 0b11,
}

export interface AstDeclaredExternTypeProperty {
  name: string;
  nameLocation: Location;
  ty: AstType;
  isMethod: boolean;
  location: Location;
  access: AstTableAccess;
}

export interface AstTableIndexer {
  indexType: AstType;
  resultType: AstType;
  location: Location;
  access: AstTableAccess;
  accessLocation?: Location;
}

export class AstStatDeclareExternType extends AstStat {
  readonly kind = "StatDeclareExternType";
  constructor(
    location: Location,
    public name: string,
    public superName: string | undefined,
    public props: AstDeclaredExternTypeProperty[],
    public indexer?: AstTableIndexer,
  ) {
    super(location);
  }
}

export class AstStatError extends AstStat {
  readonly kind = "StatError";
  constructor(
    location: Location,
    public expressions: AstExpr[],
    public statements: AstStat[],
    public messageIndex = 0,
  ) {
    super(location);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export abstract class AstType extends AstNode {}

export interface AstTypeList {
  types: AstType[];
  /** Absent when the list has no tail. */
  tailType?: AstTypePack;
}

export class AstTypeReference extends AstType {
  readonly kind = "TypeReference";
  constructor(
    location: Location,
    public prefix: string | undefined,
    public name: string,
    public prefixLocation: Location | undefined,
    public nameLocation: Location,
    public hasParameterList = false,
    public parameters: AstTypeOrPack[] = [],
  ) {
    super(location);
  }
}

export interface AstTableProp {
  name: string;
  location: Location;
  type: AstType;
  access: AstTableAccess;
  accessLocation?: Location;
}

export class AstTypeTable extends AstType {
  readonly kind = "TypeTable";
  constructor(
    location: Location,
    public props: AstTableProp[],
    public indexer?: AstTableIndexer,
  ) {
    super(location);
  }
}

export class AstTypeFunction extends AstType {
  readonly kind = "TypeFunction";
  constructor(
    location: Location,
    public attributes: AstAttr[],
    public generics: AstGenericType[],
    public genericPacks: AstGenericTypePack[],
    public argTypes: AstTypeList,
    public argNames: (AstArgumentName | undefined)[],
    public returnTypes: AstTypePack,
  ) {
    super(location);
  }

  isCheckedFunction(): boolean {
    return this.attributes.some((a) => a.type === AstAttrType.Checked);
  }
}

export class AstTypeTypeof extends AstType {
  readonly kind = "TypeTypeof";
  constructor(
    location: Location,
    public expr: AstExpr,
  ) {
    super(location);
  }
}

/** The `?` of an optional type, standing for `nil` in the union the parser makes of it. */
export class AstTypeOptional extends AstType {
  readonly kind = "TypeOptional";
}

export class AstTypeUnion extends AstType {
  readonly kind = "TypeUnion";
  constructor(
    location: Location,
    public types: AstType[],
  ) {
    super(location);
  }
}

export class AstTypeIntersection extends AstType {
  readonly kind = "TypeIntersection";
  constructor(
    location: Location,
    public types: AstType[],
  ) {
    super(location);
  }
}

export class AstTypeError extends AstType {
  readonly kind = "TypeError";
  constructor(
    location: Location,
    public types: AstType[],
    public isMissing: boolean,
    public messageIndex = 0,
  ) {
    super(location);
  }
}

export class AstTypeSingletonBool extends AstType {
  readonly kind = "TypeSingletonBool";
  constructor(
    location: Location,
    public value: boolean,
  ) {
    super(location);
  }
}

export class AstTypeSingletonString extends AstType {
  readonly kind = "TypeSingletonString";
  constructor(
    location: Location,
    public value: string,
  ) {
    super(location);
  }
}

export class AstTypeGroup extends AstType {
  readonly kind = "TypeGroup";
  constructor(
    location: Location,
    public type: AstType,
  ) {
    super(location);
  }
}

export abstract class AstTypePack extends AstNode {}

export class AstTypePackExplicit extends AstTypePack {
  readonly kind = "TypePackExplicit";
  constructor(
    location: Location,
    public typeList: AstTypeList,
  ) {
    super(location);
  }
}

export class AstTypePackVariadic extends AstTypePack {
  readonly kind = "TypePackVariadic";
  constructor(
    location: Location,
    public variadicType: AstType,
  ) {
    super(location);
  }
}

export class AstTypePackGeneric extends AstTypePack {
  readonly kind = "TypePackGeneric";
  constructor(
    location: Location,
    public genericName: string,
  ) {
    super(location);
  }
}

// ---------------------------------------------------------------------------
// Visiting
// ---------------------------------------------------------------------------

/**
 * Luau's `AstVisitor`: `visit` sees every node before its children, in the
 * order Luau visits them, and returning false skips the children.
 */
export interface AstVisitor {
  visit(node: AstNode): boolean;
}

function visitTypeOrPack(v: AstVisitor, items: AstTypeOrPack[]): void {
  for (const item of items) {
    if (item.type) visitAst(item.type, v);
    else if (item.typePack) visitAst(item.typePack, v);
  }
}

function visitTypeList(v: AstVisitor, list: AstTypeList): void {
  for (const t of list.types) visitAst(t, v);
  if (list.tailType) visitAst(list.tailType, v);
}

export function visitAst(node: AstNode, v: AstVisitor): void {
  if (!v.visit(node)) return;
  if (node instanceof AstExprGroup) visitAst(node.expr, v);
  else if (node instanceof AstExprCall) {
    visitAst(node.func, v);
    for (const a of node.args) visitAst(a, v);
  } else if (node instanceof AstExprIndexName) visitAst(node.expr, v);
  else if (node instanceof AstExprIndexExpr) {
    visitAst(node.expr, v);
    visitAst(node.index, v);
  } else if (node instanceof AstExprFunction) {
    for (const arg of node.args) if (arg.annotation) visitAst(arg.annotation, v);
    if (node.varargAnnotation) visitAst(node.varargAnnotation, v);
    if (node.returnAnnotation) visitAst(node.returnAnnotation, v);
    visitAst(node.body, v);
  } else if (node instanceof AstExprTable) {
    for (const item of node.items) {
      if (item.key) visitAst(item.key, v);
      visitAst(item.value, v);
    }
  } else if (node instanceof AstExprUnary) visitAst(node.expr, v);
  else if (node instanceof AstExprBinary) {
    visitAst(node.left, v);
    visitAst(node.right, v);
  } else if (node instanceof AstExprTypeAssertion) {
    visitAst(node.expr, v);
    visitAst(node.annotation, v);
  } else if (node instanceof AstExprIfElse) {
    visitAst(node.condition, v);
    visitAst(node.trueExpr, v);
    visitAst(node.falseExpr, v);
  } else if (node instanceof AstExprInterpString) {
    for (const e of node.expressions) visitAst(e, v);
  } else if (node instanceof AstExprInstantiate) {
    visitAst(node.expr, v);
    visitTypeOrPack(v, node.typeArguments);
  } else if (node instanceof AstExprError) {
    for (const e of node.expressions) visitAst(e, v);
  } else if (node instanceof AstStatBlock) {
    for (const s of node.body) visitAst(s, v);
  } else if (node instanceof AstStatIf) {
    visitAst(node.condition, v);
    visitAst(node.thenbody, v);
    if (node.elsebody) visitAst(node.elsebody, v);
  } else if (node instanceof AstStatWhile) {
    visitAst(node.condition, v);
    visitAst(node.body, v);
  } else if (node instanceof AstStatRepeat) {
    visitAst(node.body, v);
    visitAst(node.condition, v);
  } else if (node instanceof AstStatReturn) {
    for (const e of node.list) visitAst(e, v);
  } else if (node instanceof AstStatExpr) visitAst(node.expr, v);
  else if (node instanceof AstStatLocal) {
    for (const l of node.vars) if (l.annotation) visitAst(l.annotation, v);
    for (const e of node.values) visitAst(e, v);
  } else if (node instanceof AstStatFor) {
    if (node.variable.annotation) visitAst(node.variable.annotation, v);
    visitAst(node.from, v);
    visitAst(node.to, v);
    if (node.step) visitAst(node.step, v);
    visitAst(node.body, v);
  } else if (node instanceof AstStatForIn) {
    for (const l of node.vars) if (l.annotation) visitAst(l.annotation, v);
    for (const e of node.values) visitAst(e, v);
    visitAst(node.body, v);
  } else if (node instanceof AstStatAssign) {
    for (const e of node.vars) visitAst(e, v);
    for (const e of node.values) visitAst(e, v);
  } else if (node instanceof AstStatCompoundAssign) {
    visitAst(node.variable, v);
    visitAst(node.value, v);
  } else if (node instanceof AstStatFunction) {
    visitAst(node.name, v);
    visitAst(node.func, v);
  } else if (node instanceof AstStatLocalFunction) visitAst(node.func, v);
  else if (node instanceof AstStatTypeAlias) {
    for (const g of node.generics) visitAst(g, v);
    for (const g of node.genericPacks) visitAst(g, v);
    visitAst(node.type, v);
  } else if (node instanceof AstStatTypeFunction) visitAst(node.body, v);
  else if (node instanceof AstStatDeclareGlobal) visitAst(node.type, v);
  else if (node instanceof AstStatDeclareFunction) {
    visitTypeList(v, node.params);
    visitAst(node.retTypes, v);
  } else if (node instanceof AstStatError) {
    for (const e of node.expressions) visitAst(e, v);
    for (const s of node.statements) visitAst(s, v);
  } else if (node instanceof AstGenericType) {
    if (node.defaultValue) visitAst(node.defaultValue, v);
  } else if (node instanceof AstGenericTypePack) {
    if (node.defaultValue) visitAst(node.defaultValue, v);
  } else if (node instanceof AstTypeReference) {
    visitTypeOrPack(v, node.parameters);
  } else if (node instanceof AstTypeTable) {
    for (const p of node.props) visitAst(p.type, v);
    if (node.indexer) {
      visitAst(node.indexer.indexType, v);
      visitAst(node.indexer.resultType, v);
    }
  } else if (node instanceof AstTypeFunction) {
    visitTypeList(v, node.argTypes);
    visitAst(node.returnTypes, v);
  } else if (node instanceof AstTypeTypeof) visitAst(node.expr, v);
  else if (node instanceof AstTypeUnion || node instanceof AstTypeIntersection || node instanceof AstTypeError) {
    for (const t of node.types) visitAst(t, v);
  } else if (node instanceof AstTypeGroup) visitAst(node.type, v);
  else if (node instanceof AstTypePackExplicit) visitTypeList(v, node.typeList);
  else if (node instanceof AstTypePackVariadic) visitAst(node.variadicType, v);
}

/** The function a call expression names, written as a dotted path, as Luau's `getFunctionNameAsString`. */
export function getFunctionNameAsString(expr: AstExpr): string | undefined {
  let curr: AstExpr = expr;
  let s = "";
  for (;;) {
    if (curr instanceof AstExprLocal) return curr.local.name + s;
    if (curr instanceof AstExprGlobal) return curr.name + s;
    if (curr instanceof AstExprIndexName) {
      s = `.${curr.index}${s}`;
      curr = curr.expr;
    } else if (curr instanceof AstExprGroup) {
      curr = curr.expr;
    } else {
      return undefined;
    }
  }
}
