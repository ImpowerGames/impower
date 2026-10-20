// A screenplay made of the constructs the writer emits for display: scenes
// and a branch, action and dialogue lines inline and in blocks,
// parentheticals and directives, trailing and leading glue, breaks, tags,
// load lines, comments, and `done`.
export function displayScreenplay(): string {
  const L: string[] = ["# opening tag", "Before any scene.", ""];
  for (let s = 0; s < 6; s++) {
    L.push(`scene SCENE_${s}`);
    L.push(`  The room ${s} is quiet.`);
    L.push("");
    L.push("  HERO:");
    L.push(`    [[hero_calm]]`);
    L.push("    (quietly)");
    L.push(`    Line one of scene ${s}.`);
    L.push("");
    L.push(`  RIVAL: A reply in scene ${s}. # mood`);
    L.push(`  You see a ..`);
    L.push(`  .. door in scene ${s}. > It opens.`);
    L.push(`  HERO: Wait ..`);
    L.push(`  HERO: .. right there.`);
    L.push("  // a comment");
    L.push(`  load hero_calm`);
    L.push(`  First beat ${s} > Second beat ${s}.`);
    if (s % 2 === 0) {
      L.push(`  branch side_${s}`);
      L.push(`    A side line in scene ${s}.`);
      L.push("  end");
    }
    L.push("  done");
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}
