// Writes a save in a process of its own, for `programSave.test.ts` to load
// in another (run with vite-node from the package directory): a compiler
// that compiled another program first, reseeded its table and compiled
// `LOOP_TUNNEL_SCRIPT`, plays it to the beat inside the tunnel, and prints
// the save after `SAVE_MARKER`.
import "../../inkjs/engine/Container";
import { ProgramStory } from "../../program/ProgramStory";
import { programSession } from "./programHarness";
import { LOOP_TUNNEL_SCRIPT, SAVE_MARKER } from "./programSaveScripts";

const extra = "scene before\n  Before.\nend\n\n";
const session = programSession(
  LOOP_TUNNEL_SCRIPT.replace("scene early", `${extra}scene early`),
);
session.reseed();
const root = session.edit(extra, "");
const story = new ProgramStory(root);
story.keepBeatImages = true;
story.onError = () => {};
const shown: string[] = [];
while (story.canContinue && shown.length < 2) {
  story.Continue();
  const text = story.currentText?.trim();
  if (text) shown.push(text);
}
if (shown.join("|") !== "Begin a.|Inside 0.") {
  throw new Error(`unexpected beats ${shown.join("|")}`);
}
process.stdout.write(`${SAVE_MARKER}${story.toSave()}\n`);
