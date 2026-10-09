// Writes saves in a process of its own, for the save tests to load in
// another (run with vite-node from the package directory).
//
// With no argument: a compiler that compiled another program first,
// reseeded its table and compiled `LOOP_TUNNEL_SCRIPT`, plays it to the beat
// inside the tunnel, and prints the save after `SAVE_MARKER`
// (`programSave.test.ts`).
//
// With `--scenarios`: plays each program of `SAVE_SCENARIOS` for its beats
// and prints its save after `SCENARIO_MARKER`, its name and a tab (#1429).
import { ProgramStory } from "../../program/ProgramStory";
import { programSession } from "./programHarness";
import { LOOP_TUNNEL_SCRIPT, SAVE_MARKER } from "./programSaveScripts";
import { SAVE_SCENARIOS, SCENARIO_MARKER } from "./programSaveScenarios";

if (process.argv.includes("--scenarios")) {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  const saves: string[] = [];
  try {
    for (const [name, scenario] of Object.entries(SAVE_SCENARIOS)) {
      const root = programSession(scenario.script).root;
      const story = new ProgramStory(root, { saveHistory: scenario.saveHistory });
      story.keepBeatImages = true;
      story.onError = () => {};
      let shown = 0;
      while (story.canContinue && shown < scenario.beats) {
        story.Continue();
        if (story.currentText?.trim()) {
          shown += 1;
          if (scenario.keyframeEvery && shown % scenario.keyframeEvery === 0) {
            story.captureBeat(true);
          }
        }
      }
      if (shown !== scenario.beats) {
        throw new Error(`${name}: played ${shown} beats of ${scenario.beats}`);
      }
      saves.push(`${SCENARIO_MARKER}${name}\t${story.toSave()}\n`);
    }
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
  process.stdout.write(saves.join(""));
} else {
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
}
