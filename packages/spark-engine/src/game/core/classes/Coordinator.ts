import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { IKeyboardEvent } from "../types/IKeyboardEvent";
import type { Instructions } from "../types/Instructions";
import { Clock } from "./Clock";
import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";

/**
 * Keys that advance the game the same way a tap does.
 */
const ADVANCE_KEYS = ["Enter", " "];

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
          this._interacted = true;
        }
      } else if (params.type === "keydown") {
        if (this.isAdvanceKey(params)) {
          this._interacted = true;
        }
      }
    }
  }

  /**
   * Whether a keypress should advance the game the same way a tap does.
   * Auto-repeat is ignored so that holding the key down doesn't blast through
   * several beats at once, and modified presses are left alone so they stay
   * available as shortcuts.
   */
  protected isAdvanceKey(event: IKeyboardEvent<"keydown">): boolean {
    if (event.repeat) {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    return ADVANCE_KEYS.includes(event.key);
  }

  /**
   *
   * @returns 0 = don't continue, 1 = auto advance to continue, 2 = clicked to continue
   */
  shouldContinue(): number {
    const game = this._game;
    const instructions = this._instructions;
    const waitingForChoice =
      instructions.choices && instructions.choices.length > 0;
    if (instructions.load && !waitingForChoice) {
      // A `load` beat has nothing to read; it advances on its own once its
      // loading (and the loading layout's minimum display) has finished. One
      // that also presents choices waits for the choice like any other.
      return this._finishedExecution ? 1 : 0;
    }
    if (this._finishedExecution && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    // No text or choices to display, and no audio to wait for
    if (!instructions.text && !waitingForChoice && !instructions.audio) {
      // So just autoadvance when finished
      const totalDurationMS = (instructions.end ?? 0) * 1000;
      if (this._elapsedMS >= totalDurationMS) {
        return 1;
      }
      return 0;
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
        return 1;
      }
    }
    // Player clicked to advance
    if (this._interacted) {
      this._interacted = false;
      // Only consume the finished state on the path that actually advances --
      // while waiting on a choice the interaction is ignored, so it must leave
      // the beat's finished state alone.
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
        transientLayers.filter((layer) => !instructions.image?.[layer]),
      );

      game.module.ui.showLayout("main");
      game.module.ui.reveal();

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
            game.module.ui.hideAll(choiceTargets);
            game.chosePathToContinue(index);
          };
          game.module.ui.observe("click", target, handleClick);
        });
      }

      // Process text events
      if (instructions.text) {
        Object.entries(instructions.text).forEach(([target, events]) =>
          game.module.ui.text.write(target, events, instant),
        );
      }

      // Process images events
      if (instructions.image) {
        Object.entries(instructions.image).forEach(([target, events]) =>
          game.module.ui.image.write(target, events, instant),
        );
      }

      // Process layout-lifecycle events ([[open/close/navigate]]). Mount/destroy
      // happens here (the reactive layout tree is settled at this point); the
      // enter/exit transition is fire-and-forget for visuals, while `wait` (which
      // inflated instructions.end) is what actually holds story advance.
      if (instructions.layout) {
        Object.values(instructions.layout).forEach((events) =>
          game.module.ui.applyLayoutInstructions(events, !!instant),
        );
      }

      // Coarse per-turn re-eval of reactive screen bindings (Phase 3 I2). The
      // story is settled at this point, so binding evaluators are safe to call.
      // No-op unless the reactive render path is active.
      game.module.ui.refreshLayouts();
    };

    // Process audio
    const audioTriggerIds =
      instant || !instructions.audio
        ? []
        : Object.entries(instructions.audio).map(([target, events]) =>
            game.module.audio.schedule(target, events),
          );

    // Start loading what this beat shows alongside its audio, so the wait is
    // the slower of the two rather than the sum. A `load` beat pins the named
    // scenes' sets (and loads their worlds) behind the loading layout; in
    // preview it only prefetches and never waits.
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
        const audioReady = audioTriggerIds.every((n) =>
          game.module.audio.isReady(n),
        );
        const assetsReady =
          assetTriggerId == null || assets.isReady(assetTriggerId);
        const loadReady = loadTriggerId == null || assets.isReady(loadTriggerId);
        if (audioReady && assetsReady && loadReady) {
          ready = true;
          this._startedExecution = true;
          game.module.audio.triggerAll(audioTriggerIds);
          if (assetTriggerId != null) {
            assets.trigger(assetTriggerId);
          }
          if (loadTriggerId != null) {
            assets.trigger(loadTriggerId);
          }
          game.context.system.setTimeout(() => {
            // Delay the ui update by the audio outputLatency so that audio and visuals are synced
            updateUI();
            displaying = true;
            // The beat is on screen: move the prediction window past it.
            assets.onBeatDisplayed();
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
