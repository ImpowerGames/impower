// A screenplay made of the `choose` constructs the writer emits (#697): a
// caption, a choice an `if` gates, a conditional once-only choice whose text
// has start, choice-only and chosen parts, a sticky choice whose body holds a
// nested block, a tagged choice, a fallback choice, a choice raised inside a
// thread, a labelled `then` clause that another scene diverts to, and a
// `then` clause followed by more of the scene. Each scene loops back to its
// block a few times, so a once-only choice taken once is hidden the next
// time, and then runs on to the next scene.
export function chooseScreenplay(scenes = 3): string {
  const L: string[] = [
    "store gold = 0",
    "store has_key = true",
    "store passes = 0",
    "",
    "Before any scene.",
    "",
  ];
  for (let s = 0; s < scenes; s++) {
    const next = s + 1 < scenes ? `CHOOSE_${s + 1}` : "ENDING";
    L.push(`scene CHOOSE_${s}`);
    L.push("  label top");
    L.push("  & passes = passes + 1");
    L.push(`  <- side_offer`);
    L.push(`  The door ${s} is shut, {passes} passes.`);
    L.push("  choose");
    L.push("    if has_key then");
    L.push(`      * Unlock door ${s}`);
    L.push("        The lock gives.");
    L.push("    end");
    L.push(`    * if gold < 9 [Take a coin] and pocket it`);
    L.push("      You take a coin.");
    L.push("      & gold = gold + 1");
    L.push(`    + Knock # loud`);
    L.push("      Nobody answers.");
    L.push("      choose");
    L.push(`        * Knock again ${s}`);
    L.push("          Still nothing.");
    L.push("        * ->");
    L.push("      end");
    L.push("      You wait.");
    L.push("    * ->");
    L.push(`  then (after)`);
    L.push(`    You step back with {gold} gold.`);
    L.push("    if passes < 3 then");
    L.push("      -> top");
    L.push("    end");
    L.push("  end");
    L.push(`  The corridor of ${s} runs on.`);
    L.push(`  -> ${next}`);
    L.push("  branch side_offer");
    L.push("    choose");
    L.push(`      * Slip away ${s}`);
    L.push(`        -> SIDE_${s}`);
    L.push("    end");
    L.push("  end");
    L.push("end");
    L.push("");
    L.push(`scene SIDE_${s}`);
    L.push(`  A side passage of ${s}.`);
    L.push(`  -> CHOOSE_${s}.after`);
    L.push("end");
    L.push("");
  }
  L.push("scene ENDING");
  L.push("  The end, with {gold} gold.");
  L.push("  done");
  L.push("end");
  L.push("");
  return L.join("\n");
}

// Edits the choose fuzz inserts: text inside lines, new lines, choices of
// each kind, lines inside a body and inside a `then` clause, conditions, and
// fragments that open or close a block.
export const CHOOSE_INSERTS = [
  "x",
  "\n",
  " ",
  "\n    * New choice\n",
  "\n    + Sticky one\n      Stuck.\n",
  "\n      Another body line.\n",
  "\n    Another clause line.\n",
  "\n    * if gold > 1 [Pay] up\n",
  "\n    * ->\n",
  "{gold}",
  " # tag",
  "\n  choose\n    * Inner\n  end\n",
  "then\n",
  "end\n",
  "-- c",
];
