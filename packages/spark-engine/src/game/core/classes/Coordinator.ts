import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { Instructions } from "../types/Instructions";
import { isAdvanceKey } from "../utils/isAdvanceKey";
import { BEAT_LEAD_MS } from "../utils/sharedClock";
import { Clock } from "./Clock";
import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";

export function writeBeatText(
  ui: Game["module"]["ui"],
  instructions: Instructions,
  instant = false,
  time?: number,
): Promise<void>[] {
  return Object.entries(instructions.text ?? {}).map(([target, events]) =>
    ui.text.write(
      target,
      events,
      instant,
      time,
      instant ? 0 : (instructions.extended?.[target] ?? 0),
    ),
  );
}

export class Coordinator<G extends Game> {
  protected _game: G;

  protected _instructions: Instructions;

  protected _startedExecution = false;

  protected _finishedExecution = false;

  protected _interacted = false;

  protected _cutscenePlaying = false;

  protected _timeTypedMS = -1;

  protected _elapsedMS = 0;

  protected _onTick?: (deltaMS: number) => void;

  constructor(game: G, instructions: Instructions) {
    this._game = game;
    this._instructions = instructions;
    if (game.context.system.previewing) {
      this.onPreview();
    } else {
      this.onExecute();
    }
  }

  onPreview() {
    this.display({ instant: true, preview: true });
  }

  onExecute() {
    this._onTick = this.display();
    this._onTick?.(0);
  }

  onUpdate(time: Clock) {
    if (this._onTick) {
      this._onTick(time.deltaMS);
      this._elapsedMS += time.deltaMS;
    }
    const advance = this.shouldContinue();
    if (advance === 1) {
      this._game.autoAdvancedToContinue();
    } else if (advance === 2) {
      this._game.clickedToContinue();
    }
  }

  onMessage(msg: RequestMessage | NotificationMessage) {
    if (EventMessage.type.isNotification(msg)) {
      const params = msg.params;
      if (params.type === "pointerdown") {
        if (params.button === 0) {
          this.interact();
        }
      } else if (params.type === "keydown") {
        if (isAdvanceKey(params)) {
          this.interact();
        }
      }
    }
  }

  protected interact(): void {
    if (this._instructions.cutscene && !this._finishedExecution) {
      if (this._cutscenePlaying) {
        this._game.module.ui.skipCutscene();
      }
      return;
    }
    this._interacted = true;
  }

  shouldContinue(): number {
    const game = this._game;
    if (game.ending) {
      return 0;
    }
    const instructions = this._instructions;
    const waitingForChoice =
      instructions.choices && instructions.choices.length > 0;
    if (instructions.hold) {
      return this.continueOnInteraction(waitingForChoice);
    }
    if ((instructions.load || instructions.cutscene) && !waitingForChoice) {
      return this._finishedExecution ? 1 : 0;
    }
    if (this._finishedExecution && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    if (!instructions.text && !waitingForChoice && !instructions.audio) {
      const totalDurationMS = (instructions.end ?? 0) * 1000;
      if (this._elapsedMS >= totalDurationMS) {
        return 1;
      }
      return 0;
    }
    const timeMSSinceTyped = this._elapsedMS - this._timeTypedMS;
    if (instructions.auto) {
      const autoAdvanceDelay =
        game.context.preferences?.["flow"]?.["auto_advance_delay"];
      if (
        !waitingForChoice &&
        this._finishedExecution &&
        timeMSSinceTyped / 1000 >= autoAdvanceDelay
      ) {
        return 1;
      }
    }
    return this.continueOnInteraction(waitingForChoice);
  }

  protected continueOnInteraction(waitingForChoice: boolean | undefined): number {
    if (this._interacted) {
      this._interacted = false;
      if (this._finishedExecution && !waitingForChoice) {
        this._finishedExecution = false;
        return 2;
      }
      if (this._startedExecution && !waitingForChoice) {
        this.display({ instant: true });
        this._finishedExecution = true;
      }
    }
    return 0;
  }

  protected display(options?: {
    instant?: boolean;
    preview?: boolean;
  }): ((deltaMS: number) => void) | undefined {
    const game = this._game;
    const instructions = this._instructions;

    const autoAdvance = instructions?.auto;

    const instant = options?.instant;
    const previewing = options?.preview;

    const transientLayers: string[] = game.module.ui.getTransientTargets();

    const extended = Boolean(instructions.extended);

    if (!instant && !extended) {
      game.module.audio.stopChannel("sound");
      game.module.audio.stopChannel("voice");
    }
    game.module.audio.stopChannel("typewriter");

    const updateUI = (time?: number) => {
      const composed = game.module.ui.beginCompose();
      writeUI(time);
      if (composed) {
        void game.module.ui.endCompose(time != null ? { time } : {});
      }
    };
    const writeUI = (time?: number) => {
      if (!extended || instructions.text) {
        game.module.ui.text.clearAll(transientLayers);
      }
      if (!extended) {
        game.module.ui.image.clearAll(
          transientLayers.filter((layer) => !instructions.image?.[layer]),
        );
      }
      game.module.ui.image.restoreCleared(instructions);

      game.module.ui.showLayout("main");
      game.module.ui.reveal();

      const indicatorStyle: Record<string, string | null> = {};
      if (autoAdvance || game.ending) {
        indicatorStyle["display"] = "none";
      } else {
        indicatorStyle["transition"] = "none";
        indicatorStyle["opacity"] = instant ? "1" : "0";
        indicatorStyle["animation-play-state"] = "paused";
        indicatorStyle["display"] = null;
      }
      game.module.ui.style.update("continue_indicator", indicatorStyle);

      const choiceTargets = instructions.choices;
      if (choiceTargets) {
        choiceTargets.forEach((target, index) => {
          const handleClick = (): void => {
            game.module.ui.text.clearAll(choiceTargets);
            game.module.ui.image.clearAll(choiceTargets);
            game.module.ui.unobserve("click", target);
            game.module.ui.hideAll(choiceTargets);
            game.chosePathToContinue(index);
          };
          game.module.ui.observe("click", target, handleClick);
        });
      }

      writeBeatText(game.module.ui, instructions, instant, time);

      if (instructions.image) {
        Object.entries(instructions.image).forEach(([target, events]) =>
          game.module.ui.image.write(target, events, instant, time),
        );
      }

      if (instructions.layout) {
        const settle = !!instant || Boolean(game.context.system.simulating);
        Object.values(instructions.layout).forEach((events) =>
          game.module.ui.composeWait(
            game.module.ui.applyLayoutInstructions(events, settle),
          ),
        );
      }

      game.module.ui.refreshLayouts();
    };

    const audioTriggerIds =
      instant || !instructions.audio
        ? []
        : Object.entries(instructions.audio).map(([target, events]) =>
            game.module.audio.schedule(target, events),
          );

    const assets = game.module.assets;
    const simulating = Boolean(game.context.system.simulating);
    const assetTriggerId =
      instant || simulating ? null : assets.prepareBeat(instructions);
    let loadTriggerId: number | null = null;
    if (instructions.load && !simulating) {
      if (!instant) {
        loadTriggerId = assets.runLoad(instructions.load);
      } else if (previewing) {
        assets.runLoad(instructions.load);
      }
    }
    const cutscene = instructions.cutscene?.[0];
    let cutsceneTriggerId: number | null = null;

    const handleFinished = (): void => {
      const indicatorStyle: Record<string, string | null> = {};
      indicatorStyle["transition"] = null;
      indicatorStyle["opacity"] = "1";
      indicatorStyle["animation-play-state"] = previewing
        ? "paused"
        : "running";
      game.module.ui.style.update("continue_indicator", indicatorStyle);
      this._finishedExecution = true;
    };

    if (instant || game.context.system.simulating) {
      if (cutscene && (previewing || simulating)) {
        game.module.ui.runCutscene(cutscene);
      }
      updateUI();
      handleFinished();
      if (previewing && !simulating) {
        game.module.ui.afterCompose(() => assets.onBeatDisplayed());
      }
      return;
    }

    let elapsedMS = 0;
    let ready = false;
    let finished = false;
    const totalDurationMS = (instructions.end ?? 0) * 1000;
    const handleTick = (deltaMS: number): void => {
      if (!ready) {
        const audioReady = audioTriggerIds.every((n) =>
          game.module.audio.isReady(n),
        );
        const assetsReady =
          assetTriggerId == null || assets.isReady(assetTriggerId);
        const loadReady = loadTriggerId == null || assets.isReady(loadTriggerId);
        if (audioReady && assetsReady && loadReady) {
          ready = true;
          this._startedExecution = true;
          const time = game.context.system.now() + BEAT_LEAD_MS;
          game.module.audio.triggerAll(audioTriggerIds, time);
          if (assetTriggerId != null) {
            assets.trigger(assetTriggerId);
          }
          if (loadTriggerId != null) {
            assets.trigger(loadTriggerId);
          }
          if (cutscene) {
            cutsceneTriggerId = game.module.ui.runCutscene(cutscene);
            this._cutscenePlaying = true;
          }
          updateUI(time);
          elapsedMS = -(BEAT_LEAD_MS + game.module.audio.outputLatency * 1000);
          game.module.ui.afterCompose(() => assets.onBeatDisplayed());
        }
      } else if (!finished) {
        elapsedMS += deltaMS;
      }
      if (ready && !finished) {
        if (
          cutsceneTriggerId != null &&
          game.module.ui.isReady(cutsceneTriggerId)
        ) {
          game.module.ui.trigger(cutsceneTriggerId);
          cutsceneTriggerId = null;
          this._cutscenePlaying = false;
        }
        if (elapsedMS >= totalDurationMS && cutsceneTriggerId == null) {
          finished = true;
          handleFinished();
        }
      }
    };
    return handleTick;
  }
}
