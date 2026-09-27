// The screenplays the compiler's equivalence oracles run over.
//
// Both use the `scene NAME ... end` syntax (not `= knot`) so each scene is a
// top-level NAMED runtime flow (in mainContentContainer.namedOnlyContent),
// which is exactly what the per-flow location cache and ToJson memo reuse, and
// both hold cross-flow references (diverts between scenes, read-counts,
// defines, chained dialogue), where naive per-chunk reuse breaks.

// The single-edit oracle's fixture. Each scene also holds a glued
// continuation with a break. Lowering names a continuation's `group` by the
// offset its statement starts at, which an edit above it moves.
export function coupledScreenplay(): string {
  const L: string[] = [];
  L.push("title: Incr Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("define hero as character with");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("end");
  L.push("");
  L.push("define cfg as object with");
  L.push("  speed = 5");
  L.push("  items = { sword = 1, shield = 2 }");
  L.push("end");
  L.push("");
  L.push("store trust = 0");
  L.push("store visited_count = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  const SC = 14;
  for (let s = 0; s < SC; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Second line with {trust} and read-count {scene_${(s + 1) % SC}} here.`);
    L.push(`hero: Glued in scene ${s} ..`);
    L.push(`.. carried on > and broken.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    // Cross-flow divert to another scene.
    L.push(`-> scene_${(s + 3) % SC}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

// The cumulative oracle's fixture: the same screenplay without the `cfg`
// define and the glued continuations.
export function cumulativeScreenplay(): string {
  const L: string[] = [];
  L.push("title: Incr Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("define hero as character with");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("end");
  L.push("");
  L.push("store trust = 0");
  L.push("store visited_count = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  const SC = 14;
  for (let s = 0; s < SC; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Second line with {trust} and read-count {scene_${(s + 1) % SC}} here.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    L.push(`-> scene_${(s + 3) % SC}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}
