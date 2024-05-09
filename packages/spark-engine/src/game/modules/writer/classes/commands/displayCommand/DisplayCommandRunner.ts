import type { Game } from "../../../../../core/classes/Game";
import { EventMessage } from "../../../../../core/classes/messages/EventMessage";
import { MessageCallback } from "../../../../../core/types/MessageCallback";
import type { Phrase } from "../../../../../modules/writer/types/Phrase";
import { CommandRunner } from "../../../../logic/classes/commands/CommandRunner";
import type { DisplayCommandData } from "./DisplayCommandData";
import type { DisplayContentItem } from "./DisplayCommandParams";

export class DisplayCommandRunner<G extends Game> extends CommandRunner<
  G,
  DisplayCommandData
> {
  protected _autoDelay = 0.5;

  protected _wasPressed = false;

  protected _startedExecution = false;

  protected _finishedExecution = false;

  protected _timeTypedMS = -1;

  protected _elapsedMS = 0;

  protected _choices: DisplayContentItem[] | undefined = undefined;

  protected _chosenBlockId: string | undefined = undefined;

  protected _onTick?: (deltaMS: number) => void;

  override isSavepoint(_data: DisplayCommandData): boolean {
    return true;
  }

  override isChoicepoint(data: DisplayCommandData): boolean {
    return data.params.content.some((c) => c.button);
  }

  display(
    data: DisplayCommandData,
    options?: { instant?: boolean; preview?: boolean },
    onStarted?: () => void,
    onFinished?: () => void,
    onClickButton?: (content: DisplayContentItem) => void
  ): {
    onTick?: (deltaMS: number) => void;
    displayed?: DisplayContentItem[];
  } {
    const game = this.game;

    const type = data.params.type;
    const characterKey = data?.params?.characterKey || "";
    const content = data?.params?.content;
    const autoAdvance = data?.params?.autoAdvance;

    const context = game.context;

    let targetsCharacterName = false;
    const displayed: Phrase[] = [];
    content.forEach((c) => {
      // Override first instance of character_name with character's display name
      if (!targetsCharacterName && c.target === "character_name") {
        targetsCharacterName = true;
        c.text = context?.["character"]?.[characterKey]?.name || c.text;
      }
      // Only display content without prerequisites or that have truthy prerequisites
      if (
        !c.prerequisite ||
        Boolean(game.module.logic.evaluate(c.prerequisite))
      ) {
        const r: Phrase = {
          ...c,
        };
        if (r.text) {
          // Substitute any {variables} in text
          r.text = game.module.logic.format(r.text);
        }
        if (!r.target) {
          r.target = type;
        }
        displayed.push(r);
      }
    });

    if (displayed.length === 0) {
      // No events to process
      return {};
    }

    const instant = options?.instant;
    const previewing = options?.preview;
    const debugging = context.system.debugging;

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

    // Sequence events
    const sequence = game.module.writer.write(displayed, {
      character: characterKey,
      instant,
      debug: debugging,
    });

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
      Object.entries(sequence.button).flatMap(([target, events]) =>
        events.forEach((e) => {
          const handleClick = (): void => {
            clearUI();
            game.module.ui.unobserve("click", target);
            onClickButton?.(e);
          };
          game.module.ui.observe("click", target, handleClick);
        })
      );

      // Process text events
      Object.entries(sequence.text).map(([target, events]) =>
        game.module.ui.text.write(target, events, instant)
      );

      // Process images events
      Object.entries(sequence.image).map(([target, events]) =>
        game.module.ui.image.write(target, events, instant)
      );
    };

    // Process audio
    const audioTriggerIds = instant
      ? []
      : Object.entries(sequence.audio).map(([channel, events]) =>
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
      onFinished?.();
    };

    game.module.ui.showUI("stage");

    if (instant || game.context.system.simulating) {
      updateUI();
      handleFinished();
      return { displayed };
    }

    let elapsedMS = 0;
    let ready = false;
    let finished = false;
    const totalDurationMS = (sequence.end ?? 0) * 1000;
    const handleTick = (deltaMS: number): void => {
      if (!ready) {
        if (audioTriggerIds.every((n) => game.module.audio.isReady(n))) {
          ready = true;
          game.module.audio.triggerAll(audioTriggerIds);
          updateUI();
          onStarted?.();
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
    return { onTick: handleTick, displayed };
  }

  override onExecute(data: DisplayCommandData) {
    this._wasPressed = false;
    this._startedExecution = false;
    this._finishedExecution = false;
    this._timeTypedMS = -1;
    this._elapsedMS = 0;
    this._chosenBlockId = undefined;
    const { onTick, displayed } = this.display(
      data,
      {},
      () => {
        this._startedExecution = true;
      },
      () => {
        this._finishedExecution = true;
      },
      (c) => {
        const choiceId = data.id + "." + c.instance || "";
        const jumpTo = c.button || "";
        this._chosenBlockId = this.game.module.logic.choose(
          data.parent,
          choiceId,
          jumpTo
        );
      }
    );
    this._choices = displayed?.filter((c) => c.button);
    this._onTick = onTick;
    this._onTick?.(0);

    return super.onExecute(data);
  }

  override onUpdate(deltaMS: number) {
    if (this._onTick) {
      this._onTick(deltaMS);
      this._elapsedMS += deltaMS;
    }
  }

  override onInit(): void {
    this.game.connection.incoming.addListener("event", this.onEvent);
  }

  override onDestroy() {
    this._onTick = undefined;
    this.game.connection.incoming.removeListener("event", this.onEvent);
  }

  onEvent: MessageCallback = (msg) => {
    if (EventMessage.type.isNotification(msg)) {
      const params = msg.params;
      if (params.type === "pointerdown") {
        this._wasPressed = true;
      }
    }
  };

  override isFinished(data: DisplayCommandData) {
    const { autoAdvance } = data.params;
    const waitingForChoice = this._choices && this._choices.length > 0;
    const blockState = this.game.module.logic.state.blocks?.[data.parent];
    if (!blockState) {
      return false;
    }
    if (this._finishedExecution && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    const timeMSSinceTyped = this._elapsedMS - this._timeTypedMS;
    if (
      !waitingForChoice &&
      autoAdvance &&
      this._finishedExecution &&
      timeMSSinceTyped / 1000 >= this._autoDelay
    ) {
      return true;
    }
    if (this._wasPressed) {
      this._wasPressed = false;
      if (this._finishedExecution) {
        this._finishedExecution = false;
        if (!waitingForChoice) {
          return true;
        }
      }
      if (this._startedExecution && !waitingForChoice) {
        this.display(data, {
          instant: true,
        });
        this._finishedExecution = true;
      }
    }
    if (waitingForChoice && this._chosenBlockId != null) {
      const chosenBlockId = this._chosenBlockId;
      this._chosenBlockId = undefined;

      return chosenBlockId;
    }
    return false;
  }

  override onPreview(data: DisplayCommandData) {
    this.display(data, { instant: true, preview: true });
    return true;
  }
}
