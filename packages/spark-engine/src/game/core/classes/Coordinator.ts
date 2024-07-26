import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";
import { Instructions } from "../types/Instructions";
import { RequestMessage } from "../types/RequestMessage";
import { NotificationMessage } from "../types/NotificationMessage";

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
        this._interacted = true;
      }
    }
  }

  onPreview() {
    this.display({ instant: true, preview: true });
    return true;
  }

  protected shouldContinue() {
    const game = this._game;
    const instructions = this._instructions;
    if (!instructions) {
      return false;
    }
    const autoAdvance = instructions.auto;
    const waitingForChoice =
      instructions.choices && instructions.choices.length > 0;
    const autoAdvanceDelay =
      game.context.preferences?.["flow"]?.["auto_advance_delay"];
    if (this._finishedExecution && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    const timeMSSinceTyped = this._elapsedMS - this._timeTypedMS;
    if (
      autoAdvance &&
      !waitingForChoice &&
      this._finishedExecution &&
      timeMSSinceTyped / 1000 >= autoAdvanceDelay
    ) {
      return true;
    }
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

    if (!instant) {
      // Stop stale sound and voice audio on new dialogue line
      game.module.audio.stopChannel("sound");
      game.module.audio.stopChannel("voice");
    }
    // Stop writer audio on instant reveal and new dialogue line
    game.module.audio.stopChannel("writer");

    const clearUI = () => {
      // Clear stale text
      game.module.ui.text.clearStaleContent();
      // Clear stale images
      game.module.ui.image.clearStaleContent();
    };

    const updateUI = () => {
      // Clear stale content
      clearUI();

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
      game.module.ui.style.update("indicator", indicatorStyle);

      // Process button events
      instructions.choices?.forEach((target, index) => {
        const handleClick = (): void => {
          clearUI();
          game.module.ui.unobserve("click", target);
          game.choose(index);
          game.continue();
        };
        game.module.ui.observe("click", target, handleClick);
      });

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
        : Object.entries(instructions.audio).map(([channel, events]) =>
            game.module.audio.queue(channel, events, instant)
          );

    const handleFinished = (): void => {
      const indicatorStyle: Record<string, string | null> = {};
      indicatorStyle["transition"] = null;
      indicatorStyle["opacity"] = "1";
      indicatorStyle["animation-play-state"] = previewing
        ? "paused"
        : "running";
      game.module.ui.style.update("indicator", indicatorStyle);
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
    let finished = false;
    const totalDurationMS = (instructions.end ?? 0) * 1000;
    const handleTick = (deltaMS: number): void => {
      if (!ready) {
        if (audioTriggerIds.every((n) => game.module.audio.isReady(n))) {
          ready = true;
          game.module.audio.triggerAll(audioTriggerIds);
          updateUI();
          this._startedExecution = true;
        }
      }
      if (ready && !finished) {
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
