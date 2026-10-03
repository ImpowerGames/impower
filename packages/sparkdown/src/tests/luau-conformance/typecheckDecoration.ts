// Luau's attachTypeData/prettyPrintWithTypes convention: inferred annotations
// advance the output column; original tokens retain source lines/columns where
// those columns have not already been consumed by inserted type text.
import {
  AstExprConstantNumber,
  AstExprBinary,
  AstExprCall,
  AstExprConstantString,
  AstExprFunction,
  AstStatLocalFunction,
  AstLocal,
  AstTypeSingletonString,
  BinaryOp,
  binaryOpToString,
  visitAst,
} from "../../compiler/typecheck/Ast";
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
    return result;
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
        return p.function.name + "...";
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
      (v, i) => (argNames?.[i] ? argNames[i]!.name + ":" : "") + printType(v),
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
      if (t.kind === "TableType") return t.name ?? "<Cycle>";
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
            ? pinnedString(t.variant.value)
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
          return t.name;
        case "MetatableType":
          return printType(t.table);
        case "NegationType":
          return "negate<" + printType(t.ty) + ">";
        case "TypeFunctionInstanceType":
          return t.function.name;
        case "FunctionType": {
          const generics = [
            ...t.generics.map((v) => {
              const g = get(follow(v), "GenericType");
              return g?.name ?? "";
            }),
            ...t.genericPacks.map((v) => {
              const g = followPack(v).ty;
              return g.kind === "GenericTypePack" ? g.name + "..." : "";
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
            return t.name + (args.length ? "<" + args.join(",") + ">" : "");
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
            if (p.readTy) items.push(name + ":" + printType(p.readTy));
            if (p.writeTy && !p.isShared())
              items.push(name + ":" + printType(p.writeTy));
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
  const lines = source.split("\n"),
    starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const at = (position: { line: number; column: number }) =>
    (starts[position.line] ?? source.length) + position.column;
  const insertions = new Map<number, string>(),
    literals = new Map<number, { end: number; text: string }>();
  const printer = inferredPrinter();
  const immediate = new Set<number>();
  const binaryOperators: {
    begin: number;
    end: number;
    token: string;
    column: number;
    reserve: number;
  }[] = [];
  const bindings = new Map<AstLocal, TypeId>();
  for (const [, scope] of module.scopes)
    for (const [symbol, binding] of scope.bindings)
      if (symbol instanceof AstLocal) bindings.set(symbol, binding.typeId);
  for (const [local, type] of bindings)
    if (!local.annotation)
      insertions.set(at(local.location.end), `:${printer.printType(type)}`);
  visitAst(ast.root, {
    visit: (node) => {
      if (node instanceof AstExprCall) {
        const begin = at(node.argLocation.begin) - 1,
          end = at(node.argLocation.end);
        if (source[begin] !== "(" || source[end - 1] !== ")")
          throw new Error(
            "unsupported source decoration: call without parentheses",
          );
        // The AST-only call printer emits both delimiters immediately.
        immediate.add(begin);
        immediate.add(end - 1);
      }
      if (node instanceof AstExprBinary) {
        const reserve =
          node.op === BinaryOp.And
            ? 4
            : [
                  BinaryOp.Concat,
                  BinaryOp.CompareNe,
                  BinaryOp.CompareEq,
                  BinaryOp.CompareLe,
                  BinaryOp.CompareGe,
                  BinaryOp.Or,
                ].includes(node.op)
              ? 3
              : 2;
        binaryOperators.push({
          begin: at(node.left.location.end),
          end: at(node.right.location.begin),
          token: binaryOpToString(node.op),
          column: node.right.location.begin.column,
          reserve,
        });
      }
      if (node instanceof AstStatLocalFunction)
        insertions.delete(at(node.name.location.end));
      if (
        node instanceof AstExprConstantNumber ||
        node instanceof AstExprConstantString ||
        node instanceof AstTypeSingletonString
      ) {
        literals.set(at(node.location.begin), {
          end: at(node.location.end),
          text:
            node instanceof AstExprConstantNumber
              ? pinnedNumber(node.value)
              : pinnedString(node.value),
        });
      }
      if (
        node instanceof AstExprFunction &&
        !node.returnAnnotation &&
        node.argLocation
      ) {
        const type = module.astTypes.get(node),
          fn = type ? get(follow(type), "FunctionType") : undefined;
        if (!fn) throw new Error("no inferred function type for decoration");
        const ret = printer.printReturn(fn.retTypes);
        insertions.set(at(node.argLocation.end), `: ${ret}`);
      }
      return true;
    },
  });
  let output = "",
    line = 0,
    column = 0,
    last = "";
  const emit = (text: string) => {
    output += text;
    const pieces = text.split("\n");
    if (pieces.length > 1) {
      line += pieces.length - 1;
      column = pieces[pieces.length - 1]!.length;
    } else column += text.length;
    last = text;
  };
  const advance = (position: number) => {
    let targetLine = 0;
    while (
      targetLine + 1 < starts.length &&
      starts[targetLine + 1]! <= position
    )
      targetLine++;
    while (line < targetLine) emit("\n");
    const targetColumn = position - starts[targetLine]!;
    if (column < targetColumn) emit(" ".repeat(targetColumn - column));
  };
  // This is printing, not parsing: the already checked AST supplies literals
  // and annotations. Unsupported literal tokens fail instead of guessing.
  const token =
    /\s+|--\[=*\[[\s\S]*?\]=*\]|--[^\n]*|(?:[A-Za-z_][A-Za-z_0-9]*|\.\.\.|\.\.|::|->|==|~=|<=|>=|\/\/|[+\-*\/%^#=<>~&|?:,;.(){}\[\]])/gy;
  let cursor = 0;
  while (cursor < source.length) {
    const literal = literals.get(cursor);
    let text: string, end: number;
    if (literal) {
      text = literal.text;
      end = literal.end;
    } else {
      token.lastIndex = cursor;
      const match = token.exec(source);
      if (!match)
        throw new Error(`unsupported source decoration token at ${cursor}`);
      text = match[0];
      end = token.lastIndex;
      if (/^\s|^--/.test(text)) {
        cursor = end;
        continue;
      }
    }
    const binary = binaryOperators.find(
      (op) => op.begin <= cursor && cursor < op.end && op.token === text,
    );
    if (binary) {
      if (column + binary.reserve < binary.column) emit(" ");
    } else if (text !== "," && !immediate.has(cursor)) advance(cursor);
    if (/[A-Za-z_0-9]$/.test(last) && /^[A-Za-z_0-9]/.test(text)) emit(" ");
    emit(text);
    cursor = end;
    const inserted = insertions.get(cursor);
    if (inserted) emit(inserted);
  }
  advance(source.length);
  return output;
}
