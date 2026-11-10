import type {
  PageEntry,
  PageRecord,
} from "../../../modules/ui/types/PageState";
import type { TextInstruction } from "../../types/Instruction";
import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { PresentOptions, Presenter } from "./Presenter";
import { clearStage, writeStage } from "./stage";

const SPEAKER_TARGETS = ["character_name", "character_parenthetical"];

const CAPTIONED_CHANNELS: Record<string, string> = {
  music: "Music",
  sound: "Sound",
};

const LINE_KINDS: Record<string, PageEntry["kind"]> = {
  action: "action",
  dialogue: "dialogue",
  title: "heading",
  heading: "heading",
  transition: "heading",
};

export const TEXTSTREAM_LAYOUT = "textstream";

export function textstreamOpenAfter(
  game: Game,
  instructions: Instructions,
): boolean {
  const events = Object.values(instructions.layout ?? {}).flat();
  return game.module.ui.openedLayoutsAfter(events).includes(TEXTSTREAM_LAYOUT);
}

function label(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function visible(events: TextInstruction[] | undefined): boolean {
  return (events ?? []).some((event) => event.text.trim().length > 0);
}

export class InteractiveFictionPresenter implements Presenter {
  protected _game: Game;

  protected _instructions: Instructions;

  protected _options: PresentOptions;

  constructor(game: Game, instructions: Instructions, options: PresentOptions) {
    this._game = game;
    this._instructions = instructions;
    this._options = options;
  }

  record(): void {
    const { hold, ...beat } = this._instructions;
    const page = this._game.module.ui.page;
    const key = JSON.stringify(beat);
    page.record(
      key,
      Boolean(hold || (this._options.again && page.state.key === key)),
      (before) => this.entries(before),
    );
  }

  present(time?: number): void {
    const game = this._game;
    const ui = game.module.ui;
    if (this._options.stage) {
      ui.beginPresentation();
    }
    const composed = ui.beginCompose();
    ui.page.onChoose(this._options.choose);
    if (this._options.stage) {
      clearStage(game, this._instructions, ui.getTransientTargets());
      ui.reveal();
      writeStage(game, this._instructions, this._options.instant, time);
    }
    ui.page.show(Boolean(this._options.instant), time);
    if (composed) {
      void ui.endCompose(time != null ? { time } : {});
    }
  }

  finish(): void {}

  focus(index: number | null): void {
    this._game.module.ui.page.focus(index);
  }

  protected scene(): string | null {
    const source = this._instructions.source;
    const program = this._game.program;
    if (!source || !program) {
      return null;
    }
    const uri = Object.keys(program.scripts ?? {})[source[0]];
    const line = source[1];
    const span = uri
      ? program.sceneSpans?.[uri]?.find(
          ([header, last]) => line >= header && line <= last,
        )
      : undefined;
    return span ? `${uri}:${span[0]}` : null;
  }

  protected entries(before: readonly PageEntry[]): PageRecord {
    const instructions = this._instructions;
    const text = instructions.text ?? {};
    const lineTarget = Object.keys(text).find(
      (target) =>
        !SPEAKER_TARGETS.includes(target) && !target.startsWith("choice "),
    );
    const continued = lineTarget
      ? (instructions.extended?.[lineTarget] ?? 0)
      : 0;
    const cleared = Object.values(instructions.layout ?? {})
      .flat()
      .some(
        (event) =>
          event.control === "clear" && event.name === TEXTSTREAM_LAYOUT,
      );
    let keep = cleared ? 0 : before.length;
    if (continued > 0 && !cleared) {
      const last = before.at(-1);
      if (last && LINE_KINDS[last.kind ?? ""] !== undefined) {
        keep -= 1;
      }
    }
    const context = before.slice(0, keep);
    const scene = this.scene();
    const entries: PageEntry[] = [];
    const previousScene = context.findLast((entry) => "scene" in entry)?.scene;
    const kind = LINE_KINDS[instructions.kind ?? "action"] ?? "action";
    const line = lineTarget ? text[lineTarget] : undefined;
    const options = (instructions.choices ?? []).map(
      (target) => text[target] ?? [],
    );
    for (const [target, events] of Object.entries(instructions.image ?? {})) {
      for (const event of events) {
        if (event.control === "show" && event.assets?.length) {
          entries.push({
            kind: "caption",
            scene,
            caption: `${label(target)}: ${event.assets.join(", ")}`,
          });
        }
      }
    }
    for (const [channel, events] of Object.entries(instructions.audio ?? {})) {
      const name = CAPTIONED_CHANNELS[channel];
      if (!name) {
        continue;
      }
      for (const event of events) {
        if (
          (event.control === "play" || event.control === "start") &&
          event.assets?.length
        ) {
          entries.push({
            kind: "caption",
            scene,
            caption: `${name}: ${event.assets.join(", ")}`,
          });
        }
      }
    }
    if (line && visible(line)) {
      const entry: PageEntry = { kind, scene, text: line };
      if (continued > 0) {
        entry.shown = continued;
      }
      if (kind === "dialogue" && instructions.speaker?.name) {
        const speaker = instructions.speaker.name;
        entry.speaker = speaker;
        const previous = context.findLast((e) => e.kind !== "caption");
        if (previous?.kind !== "dialogue" || previous.speaker !== speaker) {
          entry.name = speaker;
        }
      }
      entries.push(entry);
    }
    if (options.length > 0) {
      entries.push({ kind: "options", scene, options });
    }
    if (
      entries.length > 0 &&
      previousScene !== undefined &&
      previousScene !== scene
    ) {
      entries.unshift({ kind: "rule", scene });
    }
    return { keep, entries };
  }
}
