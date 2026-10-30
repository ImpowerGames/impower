export function chooseScreenplay(scenes = 3): string {
  const L: string[] = [
    "store gold = 0",
    "store has_key = true",
    "store passes = 0",
    "",
    "scene start",
    "  Before any scene.",
    "end",
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
