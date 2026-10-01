// Generated Luau expressions for the structural oracle of #1285: every binary
// and unary operator in Luau's precedence table, every pair of binary
// operators in both orders, unary operators beside each binary operator,
// parentheses, every call form and its sugar, indexing, method calls, table
// constructors, function expressions, `if` expressions, interpolated strings,
// and the literals' spellings. Each is read inside a function whose
// parameters `a`, `b`, `c` and `...` are locals, so names resolve both ways.

/** Luau's binary operators, in the order of `BinaryOp`. */
export const BINARY_OPERATORS = ["+", "-", "*", "/", "//", "%", "^", "..", "~=", "==", "<", "<=", ">", ">=", "and", "or"];

/** Luau's unary operators, as written before an operand. */
export const UNARY_OPERATORS = ["not ", "-", "#"];

export interface GeneratedExpression {
  /** What the expression covers, for the test's name. */
  group: string;
  expression: string;
}

/** The document an expression is read in: a function whose parameters are some of the expression's names. */
export function expressionDocument(expression: string): string {
  return `function g(a, b, c, ...)\n  local x = ${expression}\n  return x\nend\n`;
}

export function generatedExpressions(): GeneratedExpression[] {
  const out: GeneratedExpression[] = [];
  const add = (group: string, expressions: string[]) => {
    for (const expression of expressions) out.push({ group, expression });
  };

  add("binary operator", BINARY_OPERATORS.map((op) => `a ${op} b`));
  for (const left of BINARY_OPERATORS) {
    for (const right of BINARY_OPERATORS) {
      add("precedence pair", [`a ${left} b ${right} c`]);
    }
  }
  for (const left of BINARY_OPERATORS) {
    for (const right of BINARY_OPERATORS) {
      add("parenthesized pair", [`(a ${left} b) ${right} c`, `a ${left} (b ${right} c)`]);
    }
  }
  add("unary operator", UNARY_OPERATORS.map((op) => `${op}a`));
  for (const unary of UNARY_OPERATORS) {
    for (const op of BINARY_OPERATORS) {
      add("unary beside binary", [`${unary}a ${op} b`, `a ${op} ${unary}b`]);
    }
  }
  add("unary chain", ["not not a", "- -a", "-#a", "#-a", "not -a", "-not a", "not #a", "- - -a", "-a ^ b", "a ^ -b", "-a ^ -b ^ c", "2 ^ 3 ^ 2", "a .. b .. c", "a - b - c", "a / b / c", "a < b == c"]);

  add("call", ["f()", "f(a)", "f(a, b)", "f(a, b, c)", "f(...)", "f(a, ...)", "f(f(a))", "f(a)(b)", "f()()", "f()(a)(b)"]);
  add("call sugar", ['f "s"', "f 's'", "f [[s]]", "f [==[s]==]", "f {}", "f {a}", "f { k = 1 }", 'f"s"', "f{a}", 'a.b "s"', "a.b {}", 'f "s" "t"', "f {} {}", 'f "s" {}']);
  add("method call", ["a:m()", "a:m(b)", "a:m(b, c)", 'a:m "s"', "a:m {}", "a:m():n()", "a.b:m()", "a[b]:m()", "f():m()", "(a):m()", '("s"):upper()']);
  add("index", ["a.b", "a.b.c", "a[b]", "a[b][c]", "a.b[c].d", 'a["s"]', "a[1 + 2]", "t[f(a)]", "a[b.c]", "f().x", "f()[1]", "(a).b", "(a)[b]"]);
  add("chain", ["a.b:c(1):d(2).e[3]", 'f(a)(b).c:d "e"', "a.b.c.d.e", "a:b():c():d()", "f(a).b[c](d)", "(f)(a)", "(f)()", "a.b(c).d(e)"]);
  add("table", [
    "{}",
    "{1, 2, 3}",
    "{1, 2, 3,}",
    "{a = 1, b = 2}",
    "{[1] = a, [b] = c}",
    "{1; 2; 3}",
    "{a = 1; [2] = 3, 4,}",
    "{f()}",
    "{f(), a}",
    "{...}",
    "{{}, {{}}}",
    "{f = function() end}",
    "{[a .. b] = c}",
    "{a, b = c, [d] = e}",
  ]);
  add("function", [
    "function() end",
    "function(d) return d end",
    "function(d, e, ...) return ... end",
    "function(...) end",
    "function(d: number): string return tostring(d) end",
    "function(d) return function(e) return d + e end end",
    "function() local y = a return y end",
    "function(a) return a end",
    "function<T>(d: T): T return d end",
    "function(...: number) end",
  ]);
  add("if expression", [
    "if a then b else c",
    "if a then b elseif c then a else b",
    "if a then if b then c else a else b",
    "if a then b else if c then a else b",
    "(if a then b else c) + 1",
    "1 + if a then b else c",
    "if a and b then c or a else not b",
  ]);
  add("interpolated string", ["`plain`", "`a{b}c`", "`{a}`", "`{a}{b}`", "`x{f(1)}y{a.b}z`", "`{a + b * c}`", "`{ {a} }`", "`{`{a}`}`", "`a\\{b`"]);
  add("string", ['"a"', "'a'", '"\\n\\t\\\\"', '"\\65\\066x"', '"\\x41"', '"\\u{48}\\u{20AC}"', '"\\z   x"', "[[a]]", "[[\nline]]", "[==[a]]b]==]", '"\\""', "'\\''", '"é"']);
  add("number", ["1", "1.5", ".5", "1.", "1e10", "1E-3", "1e+2", "0x1F", "0Xff", "0b101", "0B11", "1_000", "0xFF_FF", "0b1_0"]);
  add("constant", ["nil", "true", "false", "..."]);
  add("type assertion", ["a :: number", "(a :: any).b", "a :: number? | string", "f(a :: string)", "{a :: any}"]);
  add("multiline", [
    "a\n    + b",
    "a +\n    b",
    "f(a,\n    b)",
    "a\n    .b",
    "a\n    :m()",
    "{\n    k = 1,\n    a,\n  }",
    "if a\n    then b\n    else c",
    "a and\n    b or\n    c",
    "`a{\n    b}`",
  ]);
  add("comment", ["a --[[c]] + b", "f(--[[c]] a)", "{a, --[[c]] b}", "a + -- note\n    b"]);
  return out;
}
