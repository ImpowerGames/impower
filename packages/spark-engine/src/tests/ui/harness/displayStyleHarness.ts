import type { Instructions } from "../../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./uiTestHarness";

const SCREEN = `layout main {
  action {
    text
  }
  dialogue {
    character_info {
      character_name {
        text
      }
      character_parenthetical {
        text
      }
    }
    text
  }
}
`;

export const VALUES = `store x = "plain"\n`;

export interface Cell {
  char: string;
  style: string;
}

export const script = (body: string, values = VALUES) =>
  `${SCREEN}\n${values}\nscene start\n  ${body}\nend\n`;

export async function renderedBeat(source: string) {
  const harness = createHarness(source);
  if (harness.errors.length > 0) {
    harness.game.destroy();
    throw new Error(`fixture failed to compile: ${harness.errors.join("; ")}`);
  }
  await harness.ready;
  harness.jumpToFlow("start");
  harness.reset();
  const beat = harness.nextBeat() as Instructions;
  await harness.display(beat, true);
  await flushMicrotasks();
  const animation = (harness.game.context as any)?.animation ?? {};
  const wavy = animation["wavy"]?.$name;
  const shaky = animation["shaky"]?.$name;
  harness.game.destroy();
  const cellsOf = (target: string): Cell[] => {
    const cells: Cell[] = [];
    for (const event of beat.text?.[target] ?? []) {
      const style = (event.style ?? {}) as Record<string, unknown>;
      const styles = [
        style["font_weight"] === "bold" ? "bold" : "",
        style["font_style"] === "italic" ? "italic" : "",
        style["text_decoration"] === "underline" ? "underline" : "",
        style["text_align"] === "center" ? "centered" : "",
        style["white_space"] === "pre" ? "raw" : "",
        wavy && style["animation_name"] === wavy ? "wavy" : "",
        shaky && style["animation_name"] === shaky ? "shaky" : "",
      ].filter(Boolean);
      for (const char of event.text ?? "") {
        cells.push({ char, style: styles.sort().join(" ") });
      }
    }
    return cells;
  };
  return Object.assign(cellsOf, { beat });
}

export const show = (cells: Cell[]): string => {
  let out = "";
  let current = "";
  for (const { char, style } of cells) {
    if (style !== current) {
      out += (current ? "]" : "") + (style ? `[${style}: ` : "");
      current = style;
    }
    out += char;
  }
  return out + (current ? "]" : "");
};
