import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { Instructions } from "../types/Instructions";
import { isAdvanceKey } from "../utils/isAdvanceKey";
import { BEAT_LEAD_MS } from "../utils/sharedClock";
import { Clock } from "./Clock";
import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";
import {
  InteractiveFictionPresenter,
  textstreamOpenAfter,
} from "./presenters/InteractiveFictionPresenter";
import type { PresentOptions, Presenter } from "./presenters/Presenter";
import { StagePresenter } from "./presenters/StagePresenter";
import {
  openInitialLayouts,
  presentsText,
  textLayoutOpenAfter,
  UNSHOWN_TEXT_MESSAGE,
} from "./presenters/textLayouts";
import { VisualNovelPresenter } from "./presenters/VisualNovelPresenter";

export { writeBeatText } from "./presenters/VisualNovelPresenter";

interface PresenterKind {
  presents(game: Game, instructions: Instructions): boolean;
  create(game: Game, instructions: Instructions, options: PresentOptions): Presenter;
}

const PRESENTERS: readonly PresenterKind[] = [
  {
    presents: (game, instructions) =>
      !presentsText(instructions) || textLayoutOpenAfter(game, instructions),
    create: (game, instructions, options) =>
      new VisualNovelPresenter(game, instructions, options),
  },
  {
    presents: textstreamOpenAfter,
    create: (game, instructions, options) =>
      new InteractiveFictionPresenter(game, instructions, options),
  },
];

const CHOICE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const NEXT_KEYS = ["ArrowDown", "ArrowRight"];

const PREVIOUS_KEYS = ["ArrowUp", "ArrowLeft"];

const reportedUnshownText = new WeakSet<Game>();

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

  protected _presenters: Presenter[] = [];

  protected _displayed = false;

  protected _chosen = false;

  protected _focused: number | null = null;

  constructor(
    game: G,
    instructions: Instructions,
    options?: { settled?: boolean },
  ) {
    this._game = game;
    this._instructions = instructions;
    if (options?.settled) {
      this.onSettle();
    } else if (game.context.system.previewing) {
      this.onPreview();
    } else {
      this.onExecute();
    }
  }

  onPreview() {
    this.display({ instant: true, preview: true });
  }

  onSettle() {
    this._displayed = true;
    this.display({ instant: true });
    this._startedExecution = true;
    this._onTick = () => {};
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
        if (this.handleChoiceKey(params)) {
          return;
        }
        if (isAdvanceKey(params)) {
          this.interact();
        }
      }
    }
  }

  protected handleChoiceKey(
    params: Parameters<typeof isAdvanceKey>[0],
  ): boolean {
    const count = this._instructions.choices?.length ?? 0;
    if (count === 0 || params.altKey || params.ctrlKey || params.metaKey) {
      return false;
    }
    const key = params.key;
    const number = CHOICE_KEYS.indexOf(key);
    if (number >= 0) {
      if (number < count && !params.repeat) {
        this.choose(number);
      }
      return true;
    }
    const step = NEXT_KEYS.includes(key)
      ? 1
      : PREVIOUS_KEYS.includes(key)
        ? -1
        : 0;
    if (step !== 0) {
      const from = this._focused ?? (step > 0 ? -1 : count);
      this.focusChoice((from + step + count) % count);
      return true;
    }
    if (this._focused !== null && isAdvanceKey(params)) {
      this.choose(this._focused);
      return true;
    }
    return false;
  }

  protected focusChoice(index: number | null): void {
    this._focused = index;
    for (const presenter of this._presenters) {
      presenter.focus?.(index);
    }
  }

  protected choose(index: number): void {
    const game = this._game;
    const count = this._instructions.choices?.length ?? 0;
    if (game.ending || this._chosen || index < 0 || index >= count) {
      return;
    }
    this._chosen = true;
    if (this._focused !== null) {
      this.focusChoice(null);
    }
    for (const presenter of this._presenters) {
      presenter.chose?.(index);
    }
    game.chosePathToContinue(index);
  }

  protected presenters(options: Omit<PresentOptions, "stage">): Presenter[] {
    const game = this._game;
    const instructions = this._instructions;
    const open = PRESENTERS.filter((kind) => kind.presents(game, instructions));
    if (open.length === 0) {
      if (presentsText(instructions) && !reportedUnshownText.has(game)) {
        reportedUnshownText.add(game);
        game.log(UNSHOWN_TEXT_MESSAGE, "warning");
      }
      return [new StagePresenter(game, instructions, { ...options, stage: true })];
    }
    return open.map((kind, index) =>
      kind.create(game, instructions, { ...options, stage: index === 0 }),
    );
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

    const instant = options?.instant;
    const previewing = options?.preview;

    openInitialLayouts(
      game,
      Boolean(instant) || Boolean(game.context.system.simulating),
    );

    const presenters = this.presenters({
      instant,
      preview: previewing,
      again: this._displayed,
      choose: (index) => this.choose(index),
    });
    this._displayed = true;
    this._presenters = presenters;
    for (const presenter of presenters) {
      presenter.record?.();
    }
    const presenter = {
      present: (time?: number) => {
        for (const p of presenters) {
          p.present(time);
        }
      },
      finish: () => {
        for (const p of presenters) {
          p.finish();
        }
      },
    };

    const extended = Boolean(instructions.extended);

    if (!instant && !extended) {
      game.module.audio.stopChannel("sound");
      game.module.audio.stopChannel("voice");
    }
    game.module.audio.stopChannel("typewriter");

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
      presenter.finish();
      this._finishedExecution = true;
    };

    if (instant || game.context.system.simulating) {
      if (cutscene && (previewing || simulating)) {
        game.module.ui.runCutscene(cutscene);
      }
      presenter.present();
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
          presenter.present(time);
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
