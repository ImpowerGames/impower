// A screenplay of auto-globals (#1607): bare assignments (`x = …` with no
// declaration) that make a global of their name where resolution reaches
// them, read in scenes before and after that point, inside functions and
// through `if` blocks and loops, and globals named like functions, where a
// call of the name calls the function and a read of it reads the global
// once its assignment has made one. The resolver of the program path has to
// give each read the answer a cold compile gives it, in the order a cold
// compile reaches them (docs/engine/binary-program.md, What is built, The
// incremental passes).
export function autoGlobalScreenplay(scenes = 4): string {
  const L: string[] = [
    "store seen = 0",
    "",
    "function score()",
    "  return 10",
    "end",
    "",
    "function bump(n)",
    "  bumped = n + 1",
    "  return bumped",
    "end",
    "",
    "Before any scene {tally} {bumped}.",
    "",
  ];
  for (let s = 0; s < scenes; s++) {
    const next = s + 1 < scenes ? `AUTO_${s + 1}` : "AUTO_END";
    L.push(`scene AUTO_${s}`);
    L.push(`  Early {tally} {late_${s}} in ${s}.`);
    L.push(`  tally = ${s}`);
    L.push("  tally = tally + 1");
    L.push(`  Tally {tally} in ${s}.`);
    L.push("  if seen < 2 then");
    L.push(`    inner_${s} = tally * 2`);
    L.push(`    Inner {inner_${s}}.`);
    L.push("  end");
    L.push(`  After {inner_${s}}.`);
    L.push("  score = 5");
    L.push(`  Score {score()} and {score} in ${s}.`);
    L.push("  & seen = seen + 1");
    L.push(`  Bumped {bump(${s})} {bumped}.`);
    L.push("  for i = 1, 2 do");
    L.push("    looped = i");
    L.push("  end");
    L.push("  Looped {looped}.");
    L.push(`  late_${s} = 1`);
    L.push(`  -> ${next}`);
    L.push("end");
    L.push("");
    if (s === 1) {
      L.push("function score_twice()");
      L.push("  return score() + score()");
      L.push("end");
      L.push("");
    }
  }
  L.push("scene AUTO_END");
  L.push("  Last {tally} {looped} {score_twice()}.");
  L.push("  done");
  L.push("end");
  L.push("");
  return L.join("\n");
}

// Edits the auto-global fuzz inserts: bare assignments, reads, a function
// and a `local` of an auto-global's name, a declaration of one, and text
// inside lines.
export const AUTO_GLOBAL_INSERTS = [
  "x",
  "\n",
  " ",
  "1",
  "{tally}",
  "{score}",
  "\n  tally = 9\n",
  "\n  score = 1\n",
  "\n  Read {late_1} {looped}.\n",
  "\n  local tally = 0\n",
  "\n  & score()\n",
  "\nfunction tally()\n  return 3\nend\n",
  "\nfunction looped()\n  return 4\nend\n",
  "\nstore tally = 2\n",
  "end\n",
  "-- c",
];
