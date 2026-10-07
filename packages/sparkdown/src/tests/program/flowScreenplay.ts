// A screenplay made of the flow constructs the writer emits (#696): scenes
// and branches, labels passed by falling through and by a jump, diverts with
// fixed and variable targets, written in full and relative to the scene,
// tunnels that return and that return onward, threads, branches with
// parameters that a tunnel, a thread and an onward return pass arguments,
// a variadic one among them (#1436), visit and turn counts
// read through the language, and alternators of each kind, inline, glued, on
// one line and as a block. Each scene runs to its end: its loop through its
// first label stops after a few passes.
export function flowScreenplay(scenes = 3): string {
  const L: string[] = [
    "store passes = 0",
    "store route = -> ENDING",
    "",
    "Before any scene.",
    "",
  ];
  for (let s = 0; s < scenes; s++) {
    L.push(`scene FLOW_${s}`);
    L.push("  label top");
    L.push(`  Visiting ${s}: {FLOW_${s}} time, top {top}.`);
    L.push("  & passes = passes + 1");
    L.push("  queue");
    L.push(`    | First pass of ${s}.`);
    L.push("    | Second pass.");
    L.push("  end");
    L.push(`  Colour {cycle|"red"|"green"} and pick {shuffle|"a"|"b"|"c"}.`);
    L.push(`  Chained .. chain|one|two|three .. here.`);
    L.push("  shuffle queue | Lucky. | Plain. end");
    L.push(`  -> FLOW_${s}.side ->`);
    L.push(`  -> carry(${s}, "tunnel") ->`);
    L.push("  <- thread_part");
    L.push("  <- forked(passes, \"x\", \"y\")");
    L.push("  if passes < 3 then");
    L.push("    -> top");
    L.push("  end");
    L.push(`  Done looping {FLOW_${s}.side} {count.turns(-> FLOW_${s}.side)} {READ_COUNT(-> top)}.`);
    L.push(`  -> FLOW_${s}.onward ->`);
    L.push("  Never shown.");
    L.push("  done");
    L.push("  branch side");
    L.push(`    Side ${s}.`);
    L.push("    ->->");
    L.push("  end");
    L.push("  branch thread_part");
    L.push(`    In the thread of ${s}.`);
    L.push("    done");
    L.push("  end");
    L.push("  branch carry(n, how)");
    L.push("    Carried {n} by {how}.");
    L.push("    ->->");
    L.push("  end");
    L.push("  branch forked(n, ...)");
    L.push("    Forked on pass {n} with {select(\"#\", ...)} more.");
    L.push("    done");
    L.push("  end");
    L.push("  branch onward");
    L.push("    Going onward.");
    L.push(s % 2 === 0 ? `    ->-> FLOW_${s}.after` : `    ->-> after(${s} + 1)`);
    L.push("  end");
    L.push(s % 2 === 0 ? "  branch after" : "  branch after(k)");
    L.push("    label mid");
    L.push(s % 2 === 0 ? `    After ${s}, mid {mid}.` : `    After ${s}, mid {mid}, k {k}.`);
    L.push(s % 2 === 0 ? "    -> route" : "    done");
    L.push("  end");
    L.push("end");
    L.push("");
  }
  L.push("scene ENDING");
  L.push("  The end, after {passes} passes.");
  L.push("  done");
  L.push("end");
  L.push("");
  return L.join("\n");
}

// Edits the flow fuzz inserts: text inside lines, new lines, labels, diverts,
// tunnels and threads, counts, alternators, and fragments that open or close
// a block or a flow.
export const FLOW_INSERTS = [
  "x",
  "\n",
  " ",
  "\n  label extra\n",
  "\n  -> top\n",
  "\n  -> FLOW_1.side ->\n",
  "\n  <- FLOW_0.thread_part\n",
  "\n  -> carry(7, \"again\") ->\n",
  "\n  <- forked(1)\n",
  ", extra",
  "{top}",
  "{FLOW_0}",
  "{cycle|1|2}",
  "\n  queue\n    | a\n    | b\n  end\n",
  "->->\n",
  "end\n",
  "done\n",
  "-- c",
  "\n  branch extra\n    Extra.\n  end\n",
];
