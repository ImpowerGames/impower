// A screenplay made of the constructs of functions (#698): functions declared
// at the top level with fixed and variadic parameters and several returns, a
// function the story takes out of a `do` block and one it leaves in an `if`
// block, closures that capture a local and write a global, a closure made by
// a closure, a comparator a builtin calls, a protected call, the method of a
// define, and display lines that call them through interpolation. Each scene
// ends with `done`, whose hint covers what an edit writes after it.
export function functionScreenplay(scenes = 3): string {
  const L: string[] = [
    "store total = 0",
    "define counter with",
    "  count = 0",
    "  function bump(by)",
    "    self.count = self.count + by",
    "    return self.count",
    "  end",
    "end",
    "",
    "do",
    "  function twice(n)",
    "    return n * 2",
    "  end",
    "end",
    "",
    "Before any scene {describe(1)} {twice(2)}.",
    "",
  ];
  for (let s = 0; s < scenes; s++) {
    L.push(`scene FN_${s}`);
    L.push(`  The room ${s} is quiet.`);
    L.push(`  Described {describe(${s})}.`);
    L.push("  local add = function(x) total = total + x end");
    L.push(`  & add(${s + 1})`);
    L.push(`  local a, b = pair(${s})`);
    L.push(`  Pair {a} {b} {count(a, b, ${s})}.`);
    L.push(`  Sorted {sortDescending({ ${s}, 3, 1 })} and {counter:bump(${s})}.`);
    L.push("  local ok, message = pcall(function() error(\"no\", 0) end)");
    L.push("  Guarded {ok} {message}.");
    L.push(`  local make = function(n) return function() return n * ${s + 2} end end`);
    L.push(`  Made {make(${s})()} total {total} twice {twice(${s})}.`);
    L.push("  if total < 0 then");
    L.push("    function reset()");
    L.push("      total = 0");
    L.push("    end");
    L.push("  end");
    L.push("  done");
    L.push("end");
    L.push("");
  }
  L.push("function describe(n)", "  return \"#\" .. n", "end", "");
  L.push("function pair(n)", "  return n, n + 1", "end", "");
  L.push("function count(...)", "  return select(\"#\", ...)", "end", "");
  L.push(
    "function sortDescending(t)",
    "  table.sort(t, function(x, y) return x > y end)",
    "  return table.concat(t, \",\")",
    "end",
    "",
  );
  return L.join("\n");
}

// Edits the function fuzz inserts: text inside lines, new lines, a closure
// and a call, fragments that change a parameter list or a call's arguments,
// open or close a function, a function declared at the top level, and one
// written inside a `do` block.
export const FUNCTION_INSERTS = [
  "x",
  "\n",
  " ",
  "1",
  " + 1",
  "{total}",
  ", 2",
  "(",
  ")",
  "...",
  "\n  local q = function() return 1 end\n",
  "\n  & add(2)\n",
  "\n  Plain line.\n",
  "return ",
  "end\n",
  "local ",
  "\nfunction helper()\n  return 7\nend\n",
  "\ndo\n  function inner()\n    return 2\n  end\nend\n",
  "-- c",
];

// A screenplay of functions whose bodies read the locals of the function that
// writes them, each body on lines of its own, so an edit inside a body can
// change what the function captures without touching the statement that
// writes it: a closure, a local function that calls itself, and a function
// declared with `...` called by name. Each scene ends with `done`.
export function captureScreenplay(scenes = 3): string {
  const L: string[] = [];
  for (let s = 0; s < scenes; s++) {
    L.push(`scene CAPTURE_${s}`);
    L.push(`  The room ${s} is quiet.`);
    L.push(`  Captured {capture(${s})}.`);
    L.push("  done");
    L.push("end");
    L.push("");
  }
  L.push(
    "function capture(n)",
    "  local base = n",
    "  local step = 2",
    "  local add = function(x)",
    "    return x + base",
    "  end",
    "  local function scale(k)",
    "    if k > 1 then",
    "      return scale(k - 1) * step",
    "    end",
    "    return step",
    "  end",
    "  function total(...)",
    "    return base + select(\"#\", ...)",
    "  end",
    "  return add(1) + scale(2) + total(1, 2)",
    "end",
    "",
  );
  return L.join("\n");
}

// Edits the capture fuzz inserts: names a body reads, locals that hide them,
// and fragments that change a name or the lines around it.
export const CAPTURE_INSERTS = [
  "x",
  "1",
  " + step",
  " + base",
  "\n    local base = 0\n",
  "\n    local step = 3\n",
  "\n",
  " ",
  "return ",
  "end\n",
  "local ",
  "-- c",
];
