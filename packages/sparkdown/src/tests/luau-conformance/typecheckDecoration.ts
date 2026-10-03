// Luau's attachTypeData/prettyPrintWithTypes convention: inferred annotations
// advance the output column; AST nodes retain source positions where those
// columns have not already been consumed by inserted type text.
import * as A from "../../compiler/typecheck/Ast";
import type { Module, SourceModule } from "../../compiler/typecheck/Module";
import { generateName } from "../../compiler/typecheck/ToString";
import {
  flatten,
  follow,
  followPack,
  get,
  PrimitiveKind,
  type TypeId,
  type TypePackId,
} from "../../compiler/typecheck/Type";

// Pinned TypeAttach.cpp rehydrates type cells into AST annotations before
// PrettyPrinter.cpp prints them. Diagnostic toString text is a different format.
function inferredPrinter() {
  // Rehydrated AstName/c_str strings and singleton strlen share this boundary.
  // Source AST string literals retain their separate explicit byte lengths.
  const cString = (value: string) => value.split("\0", 1)[0]!;
  const names = new Map<TypeId | TypePackId, string>();
  const active = new Set<TypeId | TypePackId>();
  const genericName = (
    id: TypeId | TypePackId,
    name: string,
    explicit: boolean,
  ) => {
    let result = names.get(id);
    if (result === undefined) {
      result = explicit ? name : generateName(names.size, true);
      names.set(id, result);
    }
    return cString(result);
  };
  const printPackTail = (id: TypePackId): string => {
    const value = followPack(id),
      p = value.ty;
    switch (p.kind) {
      case "TypePack":
        return "(" + printPack(value) + ")";
      case "VariadicTypePack":
        return p.hidden ? "" : "..." + printType(p.ty);
      case "GenericTypePack":
        return genericName(value, p.name, p.explicitName) + "...";
      case "FreeTypePack":
        return "free...";
      case "ErrorTypePack":
        return "Unifiable<Error>...";
      case "BlockedTypePack":
        return "*blocked*...";
      case "TypeFunctionInstanceTypePack":
        return cString(p.function.name) + "...";
      default:
        throw new Error("unsupported inferred pack decoration: " + p.kind);
    }
  };
  const printPack = (
    id: TypePackId,
    argNames?: readonly ({ name: string } | undefined)[],
  ): string => {
    const { head, tail } = flatten(id);
    const parts = head.map(
      (v, i) =>
        (argNames?.[i] ? cString(argNames[i]!.name) + ":" : "") + printType(v),
    );
    if (tail) {
      const text = printPackTail(tail);
      if (text) parts.push(text);
    }
    return parts.join(",");
  };
  const printType = (id: TypeId): string => {
    const value = follow(id),
      t = value.ty;
    if (active.has(value)) {
      if (t.kind === "TableType") return cString(t.name ?? "<Cycle>");
      if (t.kind === "FunctionType") return "<Cycle>";
      throw new Error("unsupported cyclic inferred decoration: " + t.kind);
    }
    active.add(value);
    try {
      switch (t.kind) {
        case "PrimitiveType":
          return [
            "nil",
            "boolean",
            "number",
            "integer",
            "string",
            "thread",
            "function",
            "table",
            "buffer",
          ][t.type]!;
        case "SingletonType":
          return t.variant.kind === "StringSingleton"
            ? // TypeAttach rehydrates the c_str with strlen, unlike source AST
              // strings whose explicit byte length preserves embedded NUL.
              pinnedString(cString(t.variant.value))
            : String(t.variant.value);
        case "AnyType":
          return "any";
        case "UnknownType":
          return "unknown";
        case "NeverType":
          return "never";
        case "NoRefineType":
          return "*no-refine*";
        case "ErrorType":
          return "Unifiable<Error>";
        case "FreeType":
          return "free";
        case "BlockedType":
          return "*blocked*";
        case "PendingExpansionType":
          return "*pending-expansion*";
        case "GenericType":
          return genericName(value, t.name, t.explicitName);
        case "ExternType":
          return cString(t.name);
        case "MetatableType":
          return printType(t.table);
        case "NegationType":
          return "negate<" + printType(t.ty) + ">";
        case "TypeFunctionInstanceType":
          return cString(t.function.name);
        case "FunctionType": {
          const generics = [
            ...t.generics.map((v) => {
              const g = get(follow(v), "GenericType");
              return cString(g?.name ?? "");
            }),
            ...t.genericPacks.map((v) => {
              const g = followPack(v).ty;
              return g.kind === "GenericTypePack"
                ? cString(g.name) + "..."
                : "";
            }),
          ].filter(Boolean);
          return (
            (generics.length ? "<" + generics.join(",") + ">" : "") +
            "(" +
            printPack(t.argTypes, t.argNames) +
            ")->(" +
            printPack(t.retTypes) +
            ")"
          );
        }
        case "TableType": {
          if (t.name) {
            const args = [
              ...t.instantiatedTypeParams.map(printType),
              ...t.instantiatedTypePackParams.map(printPackTail),
            ];
            return (
              cString(t.name) + (args.length ? "<" + args.join(",") + ">" : "")
            );
          }
          const props = [...t.props].sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          );
          if (
            !props.length &&
            t.indexer &&
            get(follow(t.indexer.indexType), "PrimitiveType")?.type ===
              PrimitiveKind.Number
          )
            return "{" + printType(t.indexer.indexResultType) + "}";
          const items: string[] = [];
          for (const [name, p] of props) {
            if (p.readTy) items.push(cString(name) + ":" + printType(p.readTy));
            if (p.writeTy && !p.isShared())
              items.push(cString(name) + ":" + printType(p.writeTy));
          }
          if (t.indexer)
            items.push(
              "[" +
                printType(t.indexer.indexType) +
                "]:" +
                printType(t.indexer.indexResultType),
            );
          return "{" + items.join(",") + "}";
        }
        case "UnionType":
        case "IntersectionType": {
          let parts = t.kind === "UnionType" ? t.options : t.parts;
          const separator = t.kind === "UnionType" ? "|" : "&";
          const wrapped = (v: TypeId) => {
            const kind = follow(v).ty.kind,
              text = printType(v);
            return kind === "FunctionType" ||
              kind ===
                (t.kind === "UnionType" ? "IntersectionType" : "UnionType")
              ? "(" + text + ")"
              : text;
          };
          if (t.kind === "UnionType" && parts.length === 2) {
            const nil = (v: TypeId) =>
              get(follow(v), "PrimitiveType")?.type === PrimitiveKind.NilType;
            if (nil(parts[0]!)) parts = [parts[1]!, parts[0]!];
            if (nil(parts[1]!)) return wrapped(parts[0]!) + "?";
          }
          return parts.map(wrapped).join(separator);
        }
        default:
          throw new Error("unsupported inferred type decoration: " + t.kind);
      }
    } finally {
      active.delete(value);
    }
  };
  const printReturn = (id: TypePackId) => {
    const { head, tail } = flatten(id);
    const count = head.length + (tail && printPackTail(tail) ? 1 : 0);
    const text = printPack(id);
    return count === 1 ? text : `(${text})`;
  };
  return { printType, printReturn };
}

// PrettyPrinter.cpp::StringWriter::string and StringUtils.cpp::escape at7d5.
// Escape both quotes regardless of the chosen delimiter, plus control bytes.
function pinnedString(value: string): string {
  const quote = value.includes("'") ? '"' : "'";
  const named: Record<number, string> = {
    7: "a",
    8: "b",
    9: "t",
    10: "n",
    11: "v",
    12: "f",
    13: "r",
  };
  let result = quote;
  for (const c of value) {
    const byte = c.charCodeAt(0);
    if (named[byte]) result += "\\" + named[byte];
    else if (c === "\\" || c === "'" || c === '"') result += "\\" + c;
    else if (byte < 32 || c === String.fromCharCode(96) || c === "{")
      result += "\\" + byte.toString().padStart(3, "0");
    else result += c;
  }
  return result + quote;
}

// PrettyPrinter.cpp::isIntegerish and the AST-only constant-number branch.
// C's %.17g switches at decimal exponents -4/17, unlike JS toString/precision.
function pinnedNumber(value: number): string {
  if (value === Infinity) return "1e500";
  if (value === -Infinity) return "-1e500";
  if (Number.isNaN(value)) return "0/0";
  if (Object.is(value, -0)) return "-0";
  if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647)
    return String(value);
  // JS decimal formatting rounds ties away from zero; C printf uses ties to
  // even. Round the exact IEEE754 rational once to 17 significant digits.
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, Math.abs(value));
  const bits = data.getBigUint64(0);
  const binaryExponent = Number((bits >> 52n) & 2047n);
  const significand =
    (bits & ((1n << 52n) - 1n)) | (binaryExponent ? 1n << 52n : 0n);
  const power = (binaryExponent || 1) - 1023 - 52;
  let numerator = power >= 0 ? significand << BigInt(power) : significand;
  let denominator = power < 0 ? 1n << BigInt(-power) : 1n;
  const ten = (n: number) => 10n ** BigInt(n);
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  const atLeastPower = (n: number) =>
    n >= 0
      ? numerator >= denominator * ten(n)
      : numerator * ten(-n) >= denominator;
  while (!atLeastPower(exponent)) exponent--;
  while (atLeastPower(exponent + 1)) exponent++;
  const scale = 16 - exponent;
  if (scale >= 0) numerator *= ten(scale);
  else denominator *= ten(-scale);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (
    remainder * 2n > denominator ||
    (remainder * 2n === denominator && rounded % 2n === 1n)
  )
    rounded++;
  if (rounded === ten(17)) {
    rounded /= 10n;
    exponent++;
  }
  const digits = rounded.toString().replace(/0+$/, "");
  const sign = value < 0 ? "-" : "";
  if (exponent < -4 || exponent >= 17)
    return (
      sign +
      digits[0] +
      (digits.length > 1 ? "." + digits.slice(1) : "") +
      "e" +
      (exponent < 0 ? "-" : "+") +
      Math.abs(exponent).toString().padStart(2, "0")
    );
  const point = exponent + 1;
  return (
    sign +
    (point <= 0
      ? "0." + "0".repeat(-point) + digits
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point))
  );
}

export function decorateSource(
  source: string,
  module: Module,
  ast: SourceModule,
): string {
  // Port of the AST-only branches of PrettyPrinter.cpp at 7d5f7336.
  // No source token is replayed: comments, spelling and CST separators cannot
  // accidentally become code. TypeAttach's inferred cells are printed at their
  // synthetic (0,0) positions; explicit annotations retain their AST positions.
  const printer = inferredPrinter();
  // Luau stores literal values as byte strings and counts UTF-8 columns. The
  // TS source AST uses editor UTF-16 columns; convert only at this test boundary.
  const sourceLines = source.split("\n");
  const encoder = new TextEncoder();
  const byteColumn = (p: { line: number; column: number }) =>
    encoder.encode(sourceLines[p.line]?.slice(0, p.column) ?? "").length;
  const bindings = new Map<A.AstLocal, TypeId>();
  for (const [, scope] of module.scopes)
    for (const [symbol, binding] of scope.bindings)
      if (symbol instanceof A.AstLocal) bindings.set(symbol, binding.typeId);
  let output = "",
    line = 0,
    column = 0,
    last = "";
  const write = (text: string) => {
    output += text;
    column += text.length;
    if (text) last = text[text.length - 1]!;
  };
  const space = () => write(" ");
  const word = (text: string) => {
    if (text && /[A-Za-z_0-9]/.test(last)) space();
    write(text);
  };
  const literal = (text: string) => {
    if (/[A-Za-z_0-9]/.test(last) && /^[0-9]/.test(text)) space();
    write(text);
  };
  const advance = (p: { line: number; column: number }) => {
    while (line < p.line) {
      output += "\n";
      line++;
      column = 0;
      last = "\n";
    }
    const target = byteColumn(p);
    if (column < target) write(" ".repeat(target - column));
  };
  const before = (p: { line: number; column: number }, n: number) =>
    advance({ line: p.line, column: p.column >= n ? p.column - n : p.column });
  const maybeSpace = (p: { line: number; column: number }, reserve: number) => {
    if (column + reserve < byteColumn(p)) space();
  };
  const list = <T>(
    items: readonly T[],
    print: (item: T, index: number) => void,
  ) =>
    items.forEach((item, i) => {
      if (i) write(",");
      print(item, i);
    });
  const unsupported = (node: A.AstNode): never => {
    throw new Error("unsupported source decoration AST: " + node.kind);
  };
  function local(node: A.AstLocal) {
    advance(node.location.begin);
    word(node.name);
    if (node.annotation) {
      write(":");
      type(node.annotation);
    } else {
      const value = bindings.get(node);
      if (value) write(":" + printer.printType(value));
    }
  }
  function generics(
    types: readonly A.AstGenericType[],
    packs: readonly A.AstGenericTypePack[],
    defaults: boolean,
  ) {
    if (!types.length && !packs.length) return;
    write("<");
    list([...types, ...packs], (g) => {
      advance(g.location.begin);
      word(g.name);
      if (g instanceof A.AstGenericTypePack) write("...");
      if (defaults && g.defaultValue) {
        maybeSpace(g.defaultValue.location.begin, 2);
        write("=");
        if (g.defaultValue instanceof A.AstTypePack) pack(g.defaultValue);
        else type(g.defaultValue);
      }
    });
    write(">");
  }
  function typeList(
    items: A.AstTypeList,
    parens: boolean,
    names: readonly (A.AstArgumentName | undefined)[] = [],
  ) {
    const count = items.types.length + (items.tailType ? 1 : 0);
    const wrap =
      parens && (count !== 1 || !(items.types[0] instanceof A.AstTypeGroup));
    if (wrap) write("(");
    list(items.types, (value, index) => {
      const name = names[index];
      if (name) {
        advance(name.location.begin);
        word(name.name);
        write(":");
      }
      type(value);
    });
    if (items.tailType) {
      if (items.types.length) write(",");
      pack(items.tailType);
    }
    if (wrap) write(")");
  }
  function pack(
    node: A.AstTypePack,
    vararg = false,
    parens = true,
    fnReturn = false,
  ) {
    advance(node.location.begin);
    if (node instanceof A.AstTypePackVariadic) {
      if (!vararg) write("...");
      type(node.variadicType);
    } else if (node instanceof A.AstTypePackGeneric) {
      write(node.genericName);
      write("...");
    } else if (node instanceof A.AstTypePackExplicit) {
      if (vararg) unsupported(node);
      const count =
        node.typeList.types.length + (node.typeList.tailType ? 1 : 0);
      typeList(node.typeList, fnReturn ? count !== 1 : parens);
    } else unsupported(node);
  }
  function type(node: A.AstType) {
    advance(node.location.begin);
    if (node instanceof A.AstTypeReference) {
      if (node.prefix) {
        write(node.prefix);
        write(".");
      }
      advance(node.nameLocation.begin);
      write(node.name);
      if (node.hasParameterList || node.parameters.length) {
        write("<");
        list(node.parameters, typeOrPack);
        write(">");
      }
    } else if (node instanceof A.AstTypeFunction) {
      generics(node.generics, node.genericPacks, false);
      typeList(node.argTypes, true, node.argNames);
      write("->");
      pack(node.returnTypes);
    } else if (node instanceof A.AstTypeTable) {
      write("{");
      const index = node.indexer;
      if (
        !node.props.length &&
        index?.indexType instanceof A.AstTypeReference &&
        index.indexType.name === "number"
      ) {
        indexAccess(index);
        type(index.resultType);
      } else {
        list(node.props, (p) => {
          advance(p.location.begin);
          word(p.name);
          write(":");
          type(p.type);
        });
        if (index) {
          if (node.props.length) write(",");
          indexAccess(index);
          advance(index.location.begin);
          write("[");
          type(index.indexType);
          write("]:");
          type(index.resultType);
        }
      }
      before(node.location.end, 1);
      write("}");
    } else if (node instanceof A.AstTypeTypeof) {
      word("typeof");
      write("(");
      expr(node.expr);
      write(")");
    } else if (
      node instanceof A.AstTypeUnion ||
      node instanceof A.AstTypeIntersection
    ) {
      let parts = node.types;
      const union = node instanceof A.AstTypeUnion;
      if (union && parts.length === 2) {
        const nil = (n: A.AstType) =>
          n instanceof A.AstTypeReference && n.name === "nil";
        if (nil(parts[0]!) && !(parts[1] instanceof A.AstTypeOptional))
          parts = [parts[1]!, parts[0]!];
        if (nil(parts[1]!)) {
          wrapped(parts[0]!, A.AstTypeIntersection);
          write("?");
          return;
        }
      }
      parts.forEach((part, i) => {
        if (union && part instanceof A.AstTypeOptional) {
          advance(part.location.begin);
          write("?");
          return;
        }
        if (i) {
          maybeSpace(part.location.begin, 2);
          write(union ? "|" : "&");
        }
        wrapped(part, union ? A.AstTypeIntersection : A.AstTypeUnion);
      });
    } else if (node instanceof A.AstTypeGroup) {
      write("(");
      type(node.type);
      before(node.location.end, 1);
      write(")");
    } else if (node instanceof A.AstTypeSingletonBool) word(String(node.value));
    else if (node instanceof A.AstTypeSingletonString)
      write(pinnedString(node.value));
    else if (node instanceof A.AstTypeError) write("%error-type%");
    else unsupported(node);
  }
  function wrapped(
    node: A.AstType,
    opposite: typeof A.AstTypeUnion | typeof A.AstTypeIntersection,
  ) {
    const wrap = node instanceof opposite || node instanceof A.AstTypeFunction;
    if (wrap) write("(");
    type(node);
    if (wrap) write(")");
  }
  function indexAccess(index: A.AstTableIndexer) {
    // LuauPrettyPrintVisualizeIndexerAccess=true, as the test oracle bridge sets.
    if (index.access !== A.AstTableAccess.ReadWrite) {
      if (index.accessLocation) advance(index.accessLocation.begin);
      word(index.access === A.AstTableAccess.Read ? "read" : "write");
    }
  }
  function typeOrPack(value: A.AstTypeOrPack) {
    if (value.type) type(value.type);
    else if (value.typePack) pack(value.typePack);
    else throw new Error("empty decoration type argument");
  }
  function instantiate(items: readonly A.AstTypeOrPack[]) {
    write("<<");
    list(items, typeOrPack);
    write(">>");
  }
  function functionBody(node: A.AstExprFunction) {
    if (node.attributes.length) unsupported(node.attributes[0]!);
    generics(node.generics, node.genericPacks, false);
    if (node.argLocation) advance(node.argLocation.begin);
    write("(");
    list(node.args, local);
    if (node.vararg) {
      if (node.args.length) write(",");
      advance(node.varargLocation.begin);
      write("...");
      if (node.varargAnnotation) {
        write(":");
        pack(node.varargAnnotation, true);
      }
    }
    if (node.argLocation) before(node.argLocation.end, 1);
    write(")");
    if (node.returnAnnotation) {
      write(": ");
      pack(node.returnAnnotation, false, false, true);
    } else {
      const value = module.astTypes.get(node),
        fn = value ? get(follow(value), "FunctionType") : undefined;
      if (!fn) throw new Error("no inferred function type for decoration");
      write(": " + printer.printReturn(fn.retTypes));
    }
    block(node.body);
    advance(node.body.location.end);
    word("end");
  }
  function ifExpr(node: A.AstExprIfElse) {
    expr(node.condition);
    word("then");
    expr(node.trueExpr);
    if (node.falseExpr instanceof A.AstExprIfElse) {
      word("elseif");
      ifExpr(node.falseExpr);
    } else {
      word("else");
      expr(node.falseExpr);
    }
  }
  function expr(node: A.AstExpr) {
    advance(node.location.begin);
    if (node instanceof A.AstExprGroup) {
      write("(");
      expr(node.expr);
      before(node.location.end, 1);
      write(")");
    } else if (node instanceof A.AstExprConstantNil) word("nil");
    else if (node instanceof A.AstExprConstantBool) word(String(node.value));
    else if (node instanceof A.AstExprConstantNumber)
      literal(pinnedNumber(node.value));
    else if (node instanceof A.AstExprConstantString)
      write(pinnedString(node.value));
    else if (node instanceof A.AstExprLocal) word(node.local.name);
    else if (node instanceof A.AstExprGlobal) word(node.name);
    else if (node instanceof A.AstExprVarargs) write("...");
    else if (node instanceof A.AstExprCall) {
      // Preserve the existing explicit boundary; support for the other spelling
      // is not a conformance exclusion and may be added as a separate branch.
      const lines = source.split("\n"),
        p = node.argLocation.begin;
      if (lines[p.line]?.[p.column - 1] !== "(")
        throw new Error(
          "unsupported source decoration: call without parentheses",
        );
      expr(node.func);
      if (node.typeArguments.length) instantiate(node.typeArguments);
      write("(");
      list(node.args, expr);
      write(")");
    } else if (node instanceof A.AstExprIndexName) {
      expr(node.expr);
      advance(node.opPosition);
      write(node.op);
      advance(node.indexLocation.begin);
      write(node.index);
    } else if (node instanceof A.AstExprIndexExpr) {
      expr(node.expr);
      write("[");
      expr(node.index);
      write("]");
    } else if (node instanceof A.AstExprFunction) {
      if (node.attributes.length) unsupported(node.attributes[0]!);
      word("function");
      functionBody(node);
    } else if (node instanceof A.AstExprTable) {
      write("{");
      list(node.items, (item) => {
        if (
          item.kind === A.TableItemKind.Record &&
          item.key instanceof A.AstExprConstantString
        ) {
          advance(item.key.location.begin);
          word(item.key.value);
          maybeSpace(item.value.location.begin, 1);
          write("=");
        } else if (item.kind === A.TableItemKind.General && item.key) {
          write("[");
          expr(item.key);
          write("]");
          maybeSpace(item.value.location.begin, 1);
          write("=");
        } else if (item.kind !== A.TableItemKind.List) unsupported(node);
        expr(item.value);
      });
      before(node.location.end, 1);
      write("}");
      advance(node.location.end);
    } else if (node instanceof A.AstExprUnary) {
      if (node.op === A.UnaryOp.Not) word("not");
      else write(A.unaryOpToString(node.op));
      expr(node.expr);
    } else if (node instanceof A.AstExprBinary) {
      expr(node.left);
      const reserve =
        node.op === A.BinaryOp.And
          ? 4
          : [
                A.BinaryOp.Concat,
                A.BinaryOp.CompareNe,
                A.BinaryOp.CompareEq,
                A.BinaryOp.CompareLe,
                A.BinaryOp.CompareGe,
                A.BinaryOp.Or,
              ].includes(node.op)
            ? 3
            : 2;
      maybeSpace(node.right.location.begin, reserve);
      write(A.binaryOpToString(node.op));
      expr(node.right);
    } else if (node instanceof A.AstExprTypeAssertion) {
      expr(node.expr);
      maybeSpace(node.annotation.location.begin, 2);
      write("::");
      type(node.annotation);
    } else if (node instanceof A.AstExprIfElse) {
      word("if");
      ifExpr(node);
    } else if (node instanceof A.AstExprInstantiate) {
      expr(node.expr);
      instantiate(node.typeArguments);
    } else unsupported(node);
  }
  function block(node: A.AstStatBlock) {
    node.body.forEach(stat);
    advance(node.location.end);
  }
  function ifStat(node: A.AstStatIf) {
    expr(node.condition);
    if (node.thenLocation) advance(node.thenLocation.begin);
    word("then");
    block(node.thenbody);
    if (!node.elsebody) {
      advance(node.thenbody.location.end);
      word("end");
    } else if (node.elsebody instanceof A.AstStatIf) {
      if (node.elseLocation) advance(node.elseLocation.begin);
      word("elseif");
      ifStat(node.elsebody);
    } else if (node.elsebody instanceof A.AstStatBlock) {
      if (node.elseLocation) advance(node.elseLocation.begin);
      word("else");
      block(node.elsebody);
      advance(node.elsebody.location.end);
      word("end");
    } else unsupported(node.elsebody);
  }
  function stat(node: A.AstStat) {
    advance(node.location.begin);
    if (node instanceof A.AstStatBlock) {
      block(node);
      before(node.location.end, 3);
      word("end");
    } else if (node instanceof A.AstStatIf) {
      word("if");
      ifStat(node);
    } else if (node instanceof A.AstStatWhile) {
      word("while");
      expr(node.condition);
      advance(node.doLocation.begin);
      word("do");
      block(node.body);
      advance(node.body.location.end);
      word("end");
    } else if (node instanceof A.AstStatRepeat) {
      word("repeat");
      block(node.body);
      before(node.condition.location.begin, 6);
      word("until");
      expr(node.condition);
    } else if (node instanceof A.AstStatBreak) word("break");
    else if (node instanceof A.AstStatContinue) word("continue");
    else if (node instanceof A.AstStatReturn) {
      word("return");
      list(node.list, expr);
    } else if (node instanceof A.AstStatExpr) expr(node.expr);
    else if (node instanceof A.AstStatLocal) {
      if (node.isExported) unsupported(node);
      word(node.isConst ? "const" : "local");
      list(node.vars, local);
      if (node.equalsSignLocation) {
        advance(node.equalsSignLocation.begin);
        write("=");
      }
      list(node.values, expr);
    } else if (node instanceof A.AstStatFor) {
      word("for");
      local(node.variable);
      write("=");
      expr(node.from);
      write(",");
      expr(node.to);
      if (node.step) {
        write(",");
        expr(node.step);
      }
      advance(node.doLocation.begin);
      word("do");
      block(node.body);
      advance(node.body.location.end);
      word("end");
    } else if (node instanceof A.AstStatForIn) {
      word("for");
      list(node.vars, local);
      advance(node.inLocation.begin);
      word("in");
      list(node.values, expr);
      advance(node.doLocation.begin);
      word("do");
      block(node.body);
      advance(node.body.location.end);
      word("end");
    } else if (node instanceof A.AstStatAssign) {
      list(node.vars, expr);
      space();
      write("=");
      list(node.values, expr);
    } else if (node instanceof A.AstStatCompoundAssign) {
      expr(node.variable);
      const op = A.binaryOpToString(node.op) + "=";
      maybeSpace(node.value.location.begin, op.length);
      write(op);
      expr(node.value);
    } else if (node instanceof A.AstStatFunction) {
      if (node.func.attributes.length) unsupported(node.func.attributes[0]!);
      word("function");
      expr(node.name);
      functionBody(node.func);
    } else if (node instanceof A.AstStatLocalFunction) {
      if (node.func.attributes.length) unsupported(node.func.attributes[0]!);
      if (node.name.isExported) unsupported(node);
      word(node.name.isConst ? "const" : "local");
      space();
      word("function");
      advance(node.name.location.begin);
      word(node.name.name);
      functionBody(node.func);
    } else if (node instanceof A.AstStatTypeAlias) {
      if (node.exported) word("export");
      word("type");
      advance(node.nameLocation.begin);
      word(node.name);
      generics(node.generics, node.genericPacks, true);
      maybeSpace(node.type.location.begin, 2);
      write("=");
      type(node.type);
    } else if (node instanceof A.AstStatTypeFunction) {
      if (node.exported) word("export");
      space();
      word("type");
      space();
      word("function");
      advance(node.nameLocation.begin);
      word(node.name);
      functionBody(node.body);
    } else if (node instanceof A.AstStatDeclareGlobal) {
      word("declare");
      advance(node.nameLocation.begin);
      word(node.name);
      write(":");
      type(node.type);
    } else unsupported(node);
    if (node.hasSemicolon) {
      before(node.location.end, 1);
      write(";");
    }
  }
  block(ast.root);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(output, (c) => c.charCodeAt(0)),
    );
  } catch {
    // C++ can return invalid UTF-8 bytes in std::string. A JS string cannot
    // retain those bytes through the text API; fail rather than replace them.
    throw new Error(
      "unsupported source decoration: invalid UTF-8 output bytes",
    );
  }
}
