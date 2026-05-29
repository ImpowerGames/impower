import { readFileSync } from "fs";
import { resolve } from "path";
import ScreenplayParser from "../classes/ScreenplayParser";

const inputArg = process.argv[2];
const startNeedle = process.argv[3];
const stopNeedle = process.argv[4];
if (!inputArg || !startNeedle || !stopNeedle) {
  console.error(
    "Usage: dump-all-tokens <input.sd> <start-substring> <stop-substring>",
  );
  process.exit(1);
}

const script = readFileSync(resolve(process.cwd(), inputArg), "utf8");
const tokens = new ScreenplayParser().parse(script);

let on = false;
for (const t of tokens) {
  const text = t.text ?? "";
  if (!on && text.includes(startNeedle)) on = true;
  if (on) {
    console.log(
      `tag=${t.tag} text=${JSON.stringify(text).slice(0, 100)}`,
    );
  }
  if (on && text.includes(stopNeedle)) break;
}
