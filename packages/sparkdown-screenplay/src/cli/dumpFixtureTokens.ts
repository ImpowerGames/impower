import ScreenplayParser from "../classes/ScreenplayParser";

const FIXTURES: Record<string, string> = {
  inlineTitle: `^: Single line title\n`,
  blockTitle: `^:\n  OPENING CREDITS SEQUENCE\n  RAFFLES & BUNNY\n`,
  blockTitleAlt: `^: \n  OPENING CREDITS SEQUENCE\n  RAFFLES & BUNNY\n`,
  basicDialogue: `RAFFLES:\n  You mean--\n  (beat)\n`,
};

for (const [name, src] of Object.entries(FIXTURES)) {
  console.log(`\n=== ${name} ===`);
  console.log("source:", JSON.stringify(src));
  const tokens = new ScreenplayParser().parse(src);
  for (const t of tokens) {
    console.log(
      `  tag=${t.tag} position=${t.position ?? ""} text=${JSON.stringify(
        t.text ?? "",
      )}`,
    );
  }
}
