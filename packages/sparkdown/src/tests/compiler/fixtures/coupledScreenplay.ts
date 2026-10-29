export function constructs(p = ""): string[] {
  return [
    `store ${p}t = { a = 0, b = 0 }`,
    `store ${p}acc = { n = 0, add = function(self, n) return self end }`,
    `store ${p}thing = 1`,
    "",
    `# ${p}chapter marker`,
    "",
    `scene ${p}deep_choice # arc`,
    "  Beat before the choice.",
    "  choose",
    "  + [Press on]",
    "    You press on.",
    "  + [Hold back]",
    "    You hold back.",
    "  then",
    "    The way opens.",
    "    The rest of the scene runs on here.",
    `    & ${p}t.a += 1`,
    `    & ${p}acc = ${p}acc:add(1):add(2)`,
    "    & local f = function(n) return n + 1 end",
    "  end",
    "end",
    "",
    `function ${p}reckon()`,
    `  ${p}t.a += 1`,
    "  local x",
    `  x, ${p}t.b = 1, 2`,
    "  for i = 1, 2 do",
    `    ${p}t.a = ${p}t.a + i`,
    "  end",
    `  while ${p}t.b < 3 do`,
    `    ${p}t.b = ${p}t.b + 1`,
    "  end",
    `  local g = function() return ${p}later() end`,
    `  return g() + ${p}acc:add(3).n + x`,
    "end",
    "",
    `layout ${p}hud with`,
    `  text "{trust} {${p}t.a}"`,
    "end",
    "",
  ];
}

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
    L.push(`-> scene_${(s + 3) % SC}`);
    L.push("end");
    L.push("");
  }
  L.push(...constructs());
  return L.join("\n");
}

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
  L.push(...constructs());
  return L.join("\n");
}

export function includedChapter(): string {
  const L: string[] = [];
  for (let s = 0; s < 6; s++) {
    L.push(`scene chapter_${s}`);
    L.push(`  Chapter line ${s}.`);
    L.push(`-> chapter_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  L.push(...constructs("ch_"));
  return L.join("\n");
}
