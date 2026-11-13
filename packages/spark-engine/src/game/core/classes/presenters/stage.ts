import type { SpeechClip } from "../../../modules/ui/classes/messages/SpeechMessage";
import type { Instructions } from "../../types/Instructions";
import { VOICING_CONTROLS } from "../../utils/voicingControls";
import type { Game } from "../Game";

function unheardVoice(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
): SpeechClip[] | undefined {
  if (instant || game.context.system.previewing === undefined) {
    return undefined;
  }
  return (instructions.audio?.["voice"] ?? []).flatMap((event) =>
    VOICING_CONTROLS.has(event.control) && event.assets?.length
      ? game.module.audio
          .resolveLoadParams("voice", event.assets)
          .map((load) => ({ load, after: event.after ?? 0 }))
      : [],
  );
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

  game.module.ui.speak(
    instructions.speech,
    instant,
    time,
    unheardVoice(game, instructions, instant),
  );

  if (!layoutsApplied) {
    applyLayoutDirectives(game, instructions, instant);
  }

  game.module.ui.refreshLayouts();
}
