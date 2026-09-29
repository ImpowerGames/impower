// A screenplay made of the constructs the writer emits for logic (#695):
// global declarations of every kind, locals, expressions and operators,
// interpolation of every value type, tables with computed keys, property
// stores, multiple assignment, `if` blocks with `elseif` and `else`, the
// four loops with `break` and `continue` from inside nested blocks, nested
// scopes that shadow a name, and display lines between them.
export function logicScreenplay(scenes = 5): string {
  const L: string[] = [
    "store count = 0",
    "store items = { \"apple\", \"pear\", \"fig\" }",
    "store bag = { a = 1, b = 2, [3] = \"c\", [1 + 3] = 4 }",
    "store flag = true",
    "store ratio = 1.5",
    "store nothing = nil",
    "const LIMIT = 3",
    "const DOUBLE_LIMIT = LIMIT * 2",
    "define hero as character with",
    "  name = \"Hero\"",
    "end",
    "",
    "Before any scene {count}.",
    "",
  ];
  for (let s = 0; s < scenes; s++) {
    L.push(`scene LOGIC_${s}`);
    L.push(`  The room ${s} is quiet.`);
    L.push(`  local n = ${s} + 2`);
    L.push(`  Values {count} {flag} {ratio} {nothing} {bag.a} {items[1]} {DOUBLE_LIMIT}.`);
    L.push("  if count > 2 then");
    L.push(`    HERO: Many {count} in ${s}.`);
    L.push("  elseif count == 1 then");
    L.push("    HERO: One.");
    L.push("  else");
    L.push("    local n = 100");
    L.push("    HERO: None {n}.");
    L.push("  end");
    L.push("  Still {n}.");
    L.push("  while count < LIMIT do");
    L.push("    count = count + 1");
    L.push("    if count == 2 then");
    L.push("      if flag then");
    L.push("        continue");
    L.push("      end");
    L.push("    end");
    L.push(`    Count {count} in ${s}.`);
    L.push("  end");
    L.push("  for i = 1, 3 do");
    L.push("    Item {i} of {items[i]}.");
    L.push("    if i == 2 then");
    L.push("      do");
    L.push("        break");
    L.push("      end");
    L.push("    end");
    L.push("  end");
    L.push("  for k, v in bag do");
    L.push("    Pair {k} {v}.");
    L.push("  end");
    L.push("  repeat");
    L.push("    n = n - 1");
    L.push("  until n <= 0");
    L.push("  bag.a = bag.a + 1");
    L.push("  local a, b = 1, 2");
    L.push("  Sum {a + b} and {if a > b then \"big\" else \"small\"} {a and b or 0} {#items}.");
    L.push("  count = 0");
    L.push("  done");
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

// Edits the logic fuzz inserts: text inside lines, new lines and blocks,
// and fragments that open or close a block.
export const LOGIC_INSERTS = [
  "x",
  "\n",
  " ",
  "1",
  " + 1",
  "{count}",
  "\n  local q = 1\n",
  "\n  count = count + 1\n",
  "\n  if flag then\n    Flag.\n  end\n",
  "\n  for j = 1, 2 do\n    J {j}.\n  end\n",
  "break\n",
  "continue\n",
  "end\n",
  "if ",
  "\n  Plain line.\n",
  "-- c",
];
