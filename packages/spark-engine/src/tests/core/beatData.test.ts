import { describe, expect, it } from "vitest";
import { Game } from "../../game/core/classes/Game";
import type { Instructions } from "../../game/core/types/Instructions";
import { compileSrc } from "../harness/startingValuesGame";

const SOURCE = `define HERO as character with
  name = "Hero"
end

layout main {
  title {
    text
  }
  heading {
    text
  }
  transitional {
    text
  }
  action {
    text
  }
  textbox {
    character_info {
      character_name {
        text
      }
      character_parenthetical {
        text
      }
    }
    dialogue {
      text
    }
  }
  choice.0 {
    text
  }
  choice.1 {
    text
  }
  choice.2 {
    text
  }
}

-> start

scene start
  ^: The Long Night
  $: INT. HALL - NIGHT
  The hall is quiet.
  HERO (softly): Who goes there?
  %: CUT TO:
  choose
    + (a) A friend
      Welcome.
      -> DONE
    + (b) A stranger
      Leave.
      -> DONE
    + (c) Nobody
      Pass.
      -> DONE
  end
end
`;

const LINES = SOURCE.split("\n");

const lineOf = (text: string): number => {
  const line = LINES.findIndex((l) => l.includes(text));
  expect(line).toBeGreaterThan(0);
  return line;
};

const playedBeats = (): Instructions[] => {
  const { program } = compileSrc(SOURCE);
  const game = new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any) as any;
  const beats: Instructions[] = [];
  const flush = game.module.interpreter.flush.bind(game.module.interpreter);
  game.module.interpreter.flush = () => {
    const beat = flush();
    if (beat) beats.push(beat);
    return beat;
  };
  game.start();
  for (let i = 0; i < 6; i += 1) {
    game.clickedToContinue();
  }
  return beats;
};

const describedBy = (beat: Instructions | undefined) => ({
  kind: beat?.kind,
  speaker: beat?.speaker,
  options: beat?.options,
  line: beat?.source?.[1],
});

describe("the beat as data (#1988)", () => {
  const beats = playedBeats();
  const beatWith = (target: string) =>
    beats.find((beat) => beat.text?.[target]);

  it("plays one beat per line of the fixture", () => {
    expect(beats.map((beat) => Object.keys(beat.text ?? {}))).toEqual([
      ["title"],
      ["heading"],
      ["action"],
      ["dialogue", "character_parenthetical", "character_name"],
      ["transitional"],
      ["choice 0", "choice 1", "choice 2"],
    ]);
  });

  it("describes a narration line", () => {
    expect(describedBy(beatWith("action"))).toEqual({
      kind: "action",
      speaker: undefined,
      options: undefined,
      line: lineOf("The hall is quiet."),
    });
  });

  it("describes a dialogue line with a parenthetical, naming its speaker", () => {
    expect(describedBy(beatWith("dialogue"))).toEqual({
      kind: "dialogue",
      speaker: { name: "Hero", parenthetical: "(softly)", character: "HERO" },
      options: undefined,
      line: lineOf("Who goes there?"),
    });
  });

  it("describes a title", () => {
    expect(describedBy(beatWith("title"))).toEqual({
      kind: "title",
      speaker: undefined,
      options: undefined,
      line: lineOf("The Long Night"),
    });
  });

  it("describes a heading", () => {
    expect(describedBy(beatWith("heading"))).toEqual({
      kind: "heading",
      speaker: undefined,
      options: undefined,
      line: lineOf("INT. HALL - NIGHT"),
    });
  });

  it("describes a transition", () => {
    expect(describedBy(beatWith("transitional"))).toEqual({
      kind: "transition",
      speaker: undefined,
      options: undefined,
      line: lineOf("CUT TO:"),
    });
  });

  it("describes a choice menu of three options, in order beside their targets", () => {
    const menu = beatWith("choice 0");
    expect(describedBy(menu)).toEqual({
      kind: "choice",
      speaker: undefined,
      options: ["A friend", "A stranger", "Nobody"],
      line: lineOf("choose"),
    });
    expect(menu?.choices).toEqual(["choice 0", "choice 1", "choice 2"]);
  });

  it("gives a beat the script location of the line's body", () => {
    const line = lineOf("Who goes there?");
    const text = LINES[line]!;
    expect(beatWith("dialogue")?.source).toEqual([
      0,
      line,
      text.indexOf(": ") + 1,
      line,
      text.length,
    ]);
  });
});
