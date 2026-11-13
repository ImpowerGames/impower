import type { BeatSpeech, Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import { silentVoice, voiceSpans } from "./voice";

function speechOf(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
): BeatSpeech | undefined {
  const speech = instructions.speech;
  const voice = silentVoice(game, instructions, instant);
  if (!speech || !voice) {
    return speech;
  }
  const spans = voiceSpans(voice, (clip) => game.module.audio.clipLength(clip));
  return spans.length > 0 ? { character: speech.character, spans } : speech;
}

export function clearStage(
  game: Game,
  instructions: Instructions,
  transientLayers: string[],
): void {
  if (!instructions.extended) {
    game.module.ui.image.clearAll(
      transientLayers.filter((layer) => !instructions.image?.[layer]),
    );
  }
  game.module.ui.image.restoreCleared(instructions);
}

export function applyLayoutDirectives(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
): void {
  if (instructions.layout) {
    const settle = !!instant || Boolean(game.context.system.simulating);
    Object.values(instructions.layout).forEach((events) =>
      game.module.ui.composeWait(
        game.module.ui.applyLayoutInstructions(events, settle),
      ),
    );
  }
}

export function writeStage(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
  time?: number,
  layoutsApplied = false,
): void {
  if (instructions.image) {
    Object.entries(instructions.image).forEach(([target, events]) =>
      game.module.ui.image.write(target, events, instant, time),
    );
  }

  game.module.ui.speak(speechOf(game, instructions, instant), instant, time);

  if (!layoutsApplied) {
    applyLayoutDirectives(game, instructions, instant);
  }

  game.module.ui.refreshLayouts();
}
