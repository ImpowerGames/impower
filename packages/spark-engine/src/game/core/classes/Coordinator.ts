import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";
import { Instructions } from "../types/Instructions";
import { RequestMessage } from "../types/RequestMessage";
import { NotificationMessage } from "../types/NotificationMessage";
import { Typewriter } from "../../modules/interpreter";

export class Coordinator<G extends Game> {
  protected _game: G;

  protected _instructions: Instructions;

  protected _startedExecution = false;

  protected _finishedExecution = false;

  protected _interacted = false;

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

  onUpdate(deltaMS: number) {
    if (this._onTick) {
      this._onTick(deltaMS);
      this._elapsedMS += deltaMS;
    }
    if (this.shouldContinue()) {
      this._game.continue();
    }
  }

  onMessage(msg: RequestMessage | NotificationMessage) {
    if (EventMessage.type.isNotification(msg)) {
      const params = msg.params;
      if (params.type === "pointerdown") {
        if (params.button === 0) {
          this._interacted = true;
        }
      }
    }
  }

  protected shouldContinue() {
    const game = this._game;
    const instructions = this._instructions;
    const waitingForChoice =
      instructions.choices && instructions.choices.length > 0;
    if (!instructions) {
      return false;
    }
    if (this._finishedExecution && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    // No text or choices to display, and no audio to wait for
    if (!instructions.text && !waitingForChoice && !instructions.audio) {
      // So just autoadvance when finished
      const totalDurationMS = (instructions.end ?? 0) * 1000;
      if (this._elapsedMS >= totalDurationMS) {
        return true;
      }
      return false;
    }
    // Should autoadvance
    const timeMSSinceTyped = this._elapsedMS - this._timeTypedMS;
    if (instructions.auto) {
      // Autoadvance (after short delay) when finished typing
      const autoAdvanceDelay =
        game.context.preferences?.["flow"]?.["auto_advance_delay"];
      if (
        !waitingForChoice &&
        this._finishedExecution &&
        timeMSSinceTyped / 1000 >= autoAdvanceDelay
      ) {
        return true;
      }
    }
    // Player clicked to advance
    if (this._interacted) {
      this._interacted = false;
      if (this._finishedExecution) {
        this._finishedExecution = false;
        if (!waitingForChoice) {
          return true;
        }
      }
      if (this._startedExecution && !waitingForChoice) {
        this.display({ instant: true });
        this._finishedExecution = true;
      }
    }
    return false;
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

    const transientLayers: string[] = [];
    for (const [name, typewriter] of Object.entries(
      game.context["typewriter"]
    )) {
      if ((typewriter as Typewriter)?.clear_on_continue) {
        transientLayers.push(name);
      }
    }

    if (!instant) {
      // Stop stale sound and voice audio on new dialogue line
      game.module.audio.stopChannel("sound");
      game.module.audio.stopChannel("voice");
    }
    // Stop typewriter audio on instant reveal and new dialogue line
    game.module.audio.stopChannel("typewriter");

    const updateUI = () => {
      game.module.ui.text.clearAll(transientLayers);
      game.module.ui.image.clearAll(
        transientLayers.filter((layer) => !instructions.image?.[layer])
      );

      // Display click indicator
      const indicatorStyle: Record<string, string | null> = {};
      if (autoAdvance) {
        indicatorStyle["display"] = "none";
      } else {
        indicatorStyle["transition"] = "none";
        indicatorStyle["opacity"] = instant ? "1" : "0";
        indicatorStyle["animation-play-state"] = "paused";
        indicatorStyle["display"] = null;
      }
      game.module.ui.style.update("continue_indicator", indicatorStyle);

      // Process button events
      const choiceTargets = instructions.choices;
      if (choiceTargets) {
        choiceTargets.forEach((target, index) => {
          const handleClick = (): void => {
            game.module.ui.text.clearAll(choiceTargets);
            game.module.ui.image.clearAll(choiceTargets);
            game.module.ui.unobserve("click", target);
            game.choose(index);
            game.continue();
          };
          game.module.ui.observe("click", target, handleClick);
        });
      }

      // Process text events
      if (instructions.text) {
        Object.entries(instructions.text).forEach(([target, events]) =>
          game.module.ui.text.write(target, events, instant)
        );
      }

      // Process images events
      if (instructions.image) {
        Object.entries(instructions.image).forEach(([target, events]) =>
          game.module.ui.image.write(target, events, instant)
        );
      }
    };

    // Process audio
    const audioTriggerIds =
      instant || !instructions.audio
        ? []
        : Object.entries(instructions.audio).map(([target, events]) =>
            game.module.audio.schedule(target, events)
          );

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

    game.module.ui.showUI("stage");

    if (instant || game.context.system.simulating) {
      updateUI();
      handleFinished();
      return;
    }

    let elapsedMS = 0;
    let ready = false;
    let displaying = false;
    let finished = false;
    const totalDurationMS = (instructions.end ?? 0) * 1000;
    const handleTick = (deltaMS: number): void => {
      if (!ready) {
        if (audioTriggerIds.every((n) => game.module.audio.isReady(n))) {
          ready = true;
          this._startedExecution = true;
          game.module.audio.triggerAll(audioTriggerIds);
          game.context.system.setTimeout(() => {
            // Delay the ui update by the audio outputLatency so that audio and visuals are synced
            updateUI();
            displaying = true;
          }, game.module.audio.outputLatency * 1000);
        }
      }
      if (ready && displaying && !finished) {
        elapsedMS += deltaMS;
        if (elapsedMS >= totalDurationMS) {
          finished = true;
          handleFinished();
        }
      }
    };
    return handleTick;
  }
}
