import { CommandRunner } from "../../../../../core/classes/CommandRunner";
import type { Game } from "../../../../../core/classes/Game";
import { EventMessage } from "../../../../../core/classes/messages/EventMessage";
import { MessageCallback } from "../../../../../core/types/MessageCallback";
import type { Phrase } from "../../../../../modules/writer/types/Phrase";
import type { DisplayContentItem } from "./DisplayCommandParams";

export class DisplayCommandRunner<G extends Game> extends CommandRunner<G> {
  protected _autoDelay = 0.5;

  protected _wasPressed = false;

  protected _startedExecution = false;

  protected _finishedExecution = false;

  protected _timeTypedMS = -1;

  protected _elapsedMS = 0;

  protected _choices: DisplayContentItem[] | undefined = undefined;

  protected _chosenBlockId: string | undefined = undefined;

  protected _onTick?: (deltaMS: number) => void;

  protected _target: string = "";

  protected _lines: string[] = [];

  override onContinue(): boolean {
    const currentText = this.game.currentText;
    if (currentText) {
      if (currentText?.startsWith("% ")) {
        this._target = "transition";
        this._lines.push(currentText);
        console.log(this._lines);
        return true;
      }
      if (currentText?.startsWith("$ ")) {
        this._target = "scene";
        this._lines.push(currentText);
        console.log(this._lines);
        return true;
      }
      if (currentText?.startsWith("@ ")) {
        this._target = "dialogue";
        this._lines.push(currentText);
        console.log(this._lines);
        return true;
      }
      if (this._target === "dialogue") {
        this._lines.push(currentText);
        console.log(this._lines);
        return true;
      }
      this._target = "action";
    }
    return false;
  }

  override onExecute() {
    this._wasPressed = false;
    this._startedExecution = false;
    this._finishedExecution = false;
    this._timeTypedMS = -1;
    this._elapsedMS = 0;
    this._chosenBlockId = undefined;
    const { onTick, displayed } = this.display(
      this._lines,
      {},
      () => {
        this._startedExecution = true;
      },
      () => {
        this._finishedExecution = true;
      }
    );
    this._choices = displayed?.filter((c) => c.button);
    this._onTick = onTick;
    this._onTick?.(0);

    return super.onExecute();
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

  override isFinished() {
    const { autoAdvance } = data.params;
    const waitingForChoice = this._choices && this._choices.length > 0;
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
        this.display(this._lines, {
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

  override onPreview() {
    this.display(this._lines, { instant: true, preview: true });
    return true;
  }

  display(
    lines: string[],
    options?: { instant?: boolean; preview?: boolean },
    onStarted?: () => void,
    onFinished?: () => void
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
      const r: Phrase = {
        ...c,
      };
      if (!r.target) {
        r.target = type;
      }
      displayed.push(r);
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
      Object.entries(sequence.button).flatMap(([target, events], index) =>
        events.forEach(() => {
          const handleClick = (): void => {
            clearUI();
            game.module.ui.unobserve("click", target);
            this.game.choose(index);
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

  shouldFlush(text: string | null) {
    // this needs to be handled by writer parser,
    // so that it can also detect implicit chain indicators after
    // @ CHARACTER_NAME (parenthetical) ^
    // (parentheticals)
    // [[standalone_visual_tag]]
    // ((standalone_audio_tag))
    return (
      this.endsTextBlock(text) ||
      (!this.startsTextBlock(text) && !this.endsWithChain(text))
    );
  }

  startsTextBlock(text: string | null) {
    return text?.startsWith("@");
  }

  endsTextBlock(text: string | null) {
    return text?.startsWith("/@");
  }

  endsWithChain(text: string | null) {
    if (text) {
      if (text.trim().endsWith(">")) {
        // We need to make sure that the `>` at the end of the line is truly alone
        // and is not, in fact, the close of a `<text_tag>`
        for (let i = text.length - 1; i >= 0; i--) {
          const c = text[i];
          if (c) {
            if (c === "<") {
              // `>` is closing an open `<`
              return false;
            }
            if (c === ">") {
              // there cannot be an open `<` before this
              return true;
            }
          }
        }
        return true;
      }
    }
    return false;
  }
}
