import { readFileSync } from "fs";
import { resolve } from "path";
import ScreenplayParser from "../classes/ScreenplayParser";

const inputArg = process.argv[2];
const needle = process.argv[3];
if (!inputArg || !needle) {
  console.error("Usage: dump-tokens <input.sd> <substring>");
  process.exit(1);
}

const script = readFileSync(resolve(process.cwd(), inputArg), "utf8");
const tokens = new ScreenplayParser().parse(script);
const matches = tokens.filter((t) =>
  typeof t.text === "string" && t.text.includes(needle),
);
for (const t of matches) {
  console.log(`tag=${t.tag} text=${JSON.stringify(t.text)}`);
}
console.log(`(${matches.length} matches)`);
