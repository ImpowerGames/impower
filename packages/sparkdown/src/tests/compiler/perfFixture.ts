// Synthesize a structurally diverse large screenplay. Not one line × N —
// repeats varied scene/dialogue/action/choice/conditional/define/function
// blocks so the profile reflects real per-construct cost.
export function generatePerfScreenplay(sceneCount: number): string {
  const lines: string[] = [];
  lines.push("title: Perf Fixture");
  lines.push("author: Anonymous");
  lines.push("");
  // A handful of defines (characters).
  for (let i = 0; i < 8; i++) {
    lines.push(`define char_${i} as character:`);
    lines.push(`  name = "Character ${i}"`);
    lines.push(`  color = "#${(i * 111111).toString(16).padStart(6, "0")}"`);
    lines.push("");
  }
  // A couple of helper functions.
  for (let i = 0; i < 4; i++) {
    lines.push(`function helper_${i}(x):`);
    lines.push(`  local y = x + ${i}`);
    lines.push(`  return y * 2`);
    lines.push("");
  }
  lines.push("store trust = 0");
  lines.push("store mood = 0");
  lines.push("");

  for (let s = 0; s < sceneCount; s++) {
    const c = s % 8;
    lines.push(`scene Scene_${s}`);
    lines.push(`= INT. LOCATION ${s} - DAY`);
    lines.push(`[[show backdrop location_${s % 10}]]`);
    // Action block
    lines.push(":");
    lines.push(`  A character walks into location ${s}.`);
    lines.push(`  The light shifts as the scene ${s} opens.`);
    lines.push("");
    // Dialogue block
    lines.push(`char_${c}:`);
    lines.push(`  This is dialogue line one in scene ${s}.`);
    lines.push(`  And here is a second line with *emphasis* and {trust} state.`);
    lines.push("");
    // Conditional
    lines.push("if trust > 5 then");
    lines.push(`  char_${(c + 1) % 8}: I trust you now in scene ${s}.`);
    lines.push("else");
    lines.push(`  char_${(c + 1) % 8}: Not yet, scene ${s}.`);
    lines.push("end");
    lines.push("");
    // Variable mutation + function call
    lines.push(`& trust = helper_${s % 4}(trust)`);
    lines.push("");
    // Choice block
    lines.push("choose");
    lines.push(`  + [Be brave in ${s}.]`);
    lines.push(`    & mood += 1`);
    lines.push(`    char_${c}: Bravery chosen.`);
    lines.push(`  + [Be cautious in ${s}.]`);
    lines.push(`    & mood -= 1`);
    lines.push(`    char_${c}: Caution chosen.`);
    lines.push("end");
    lines.push("");
    lines.push("-> DONE");
    lines.push("end");
    lines.push("");
  }
  return lines.join("\n");
}
