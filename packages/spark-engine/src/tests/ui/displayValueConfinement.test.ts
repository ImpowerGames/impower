import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  type Cell,
  VALUES,
  renderedBeat,
  script,
  show,
} from "./harness/displayStyleHarness";

const SPARKDOWN_SOURCE = fileURLToPath(
  new URL("../../../../sparkdown/src/", import.meta.url),
);

const PRODUCER_SITE =
  /buildDisplayCall\(|buildOrderedDisplayCall\(|buildLoadCall\(|outputWhenComplete = true|PushToOutputStream\(|emit\(Op\.Out/g;

const NO_VALUE = "no value: ";

const KNOWN_PRODUCER_SITES: Record<string, { sites: number; carries: string[] }> = {
  "compiler/lower/expression/lowerExpression.ts": {
    sites: 1,
    carries: [`${NO_VALUE}a value inside a Luau string, which stays plain text`],
  },
  "compiler/lower/lowerers/lowerAssetLine.ts": {
    sites: 1,
    carries: [`${NO_VALUE}an asset line's command text`],
  },
  "compiler/lower/lowerers/lowerChoice.ts": {
    sites: 3,
    carries: [`${NO_VALUE}choice text and its echo, read whole by the player until #2144`],
  },
  "compiler/lower/lowerers/lowerDisplay.ts": {
    sites: 5,
    carries: [
      "an interpolation in a display line",
      "an inline conditional's value",
      "a braced alternator's value",
      "a function's return value",
      "a block dialogue line",
      "a line glued to the next",
      "a line carried on after a break",
    ],
  },
  "compiler/lower/utils/alternatorArms.ts": {
    sites: 2,
    carries: ["a braced alternator's value", `${NO_VALUE}an arm's text, where braces are text`],
  },
  "compiler/lower/utils/buildDivert.ts": {
    sites: 1,
    carries: [`${NO_VALUE}a load arrow's directive`],
  },
  "compiler/lower/utils/displayCall.ts": {
    sites: 3,
    carries: [`${NO_VALUE}the compiler's route, displayText, which confines every non-text part`],
  },
  "compiler/lower/utils/lowerTagContent.ts": {
    sites: 2,
    carries: [`${NO_VALUE}tag content, which writtenText strips for currentTags`],
  },
  "inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression.ts": {
    sites: 1,
    carries: [`${NO_VALUE}the runtime's route, Op.Out, which confines a value written outside a capture`],
  },
  "program/ProgramStory.ts": {
    sites: 7,
    carries: [`${NO_VALUE}script text, newlines, tags, captures and Op.Out, the runtime's route`],
  },
  "program/ProgramStoryState.ts": {
    sites: 1,
    carries: [`${NO_VALUE}PushToOutputStream itself`],
  },
  "runtime/StdLib.ts": {
    sites: 8,
    carries: ["print()", "a script's own display() table"],
  },
  "runtime/evaluation.ts": {
    sites: 1,
    carries: [`${NO_VALUE}tags kept across a function's output`],
  },
};

describe("the producers of display text are the ones the confinement test covers", () => {
  test("no producer site was added or removed without updating the producer cases", () => {
    const found: Record<string, number> = {};
    for (const entry of readdirSync(SPARKDOWN_SOURCE, { recursive: true })) {
      const file = String(entry).split(sep).join("/");
      if (!file.endsWith(".ts") || file.startsWith("tests/") || file.endsWith(".test.ts")) {
        continue;
      }
      const count = readFileSync(join(SPARKDOWN_SOURCE, file), "utf8").match(PRODUCER_SITE)?.length ?? 0;
      if (count > 0) found[file] = count;
    }
    expect(found).toEqual(
      Object.fromEntries(
        Object.entries(KNOWN_PRODUCER_SITES).map(([file, { sites }]) => [file, sites]),
      ),
    );
    const names = new Set(PRODUCERS.map((p) => p.name));
    for (const { carries } of Object.values(KNOWN_PRODUCER_SITES)) {
      for (const carried of carries) {
        if (!carried.startsWith(NO_VALUE)) expect(names).toContain(carried);
      }
    }
  });
});

interface Producer {
  name: string;
  target: string;
  body: string;
  declarations?: string;
}

const PRODUCERS: Producer[] = [
  { name: "an interpolation in a display line", target: "action", body: "*s {v} t* u" },
  { name: "an inline conditional's value", target: "action", body: `*s {if true then v else ""} t* u` },
  { name: "a braced alternator's value", target: "action", body: `*s {queue | v | "x" end} t* u` },
  {
    name: "a function's return value",
    target: "action",
    body: "*s {f()} t* u",
    declarations: "function f()\n  return v\nend\n",
  },
  { name: "a block dialogue line", target: "dialogue", body: "NOVA:\n    *s {v} t* u" },
  { name: "a line glued to the next", target: "action", body: "*s {v} t* ..\n  .. u" },
  { name: "a line carried on after a break", target: "action", body: "*s {v} t* .. >\n  .. u" },
  { name: "print()", target: "action", body: "& print(v)" },
  { name: "a script's own display() table", target: "action", body: `& display({ target = "action", text = v })` },
  {
    name: "a defined character's name",
    target: "character_name",
    body: "nova: hello",
    declarations: "define nova as character with\n  name = v\nend\n",
  },
];

const HOSTILE_VALUES: [value: string, text: string, style: string][] = [
  ["*a", "a", "italic"],
  ["**b", "b", "bold"],
  ["_c", "c", "underline"],
  ["^d", "d", "centered"],
  ["~~e", "e", "wavy"],
  ["::f", "f", "shaky"],
  ["`g", "g", "raw"],
  ["x\\u{E002}y", "xy", ""],
  ["\\u{E010}\\u{E021}z", "z", ""],
  ["h\\\\", "h", ""],
  ["*i*", "i", "italic"],
];

const isCodeCharacter = (char: string) => {
  const point = char.charCodeAt(0);
  return point >= 0xe000 && point <= 0xf8ff;
};

const renderProducer = async (producer: Producer, value: string) =>
  (
    await renderedBeat(
      script(
        producer.body,
        `${VALUES}store v = "${value}"\n${producer.declarations ?? ""}`,
      ),
    )
  )(producer.target);

const plainRenders = new Map<string, Promise<Cell[]>>();

describe("every producer of display text confines a value it carries", () => {
  test.each(
    PRODUCERS.flatMap((p) =>
      HOSTILE_VALUES.map(([value, text, ownStyle]) => [p.name, value, text, ownStyle, p] as const),
    ),
  )("%s, with the value %s", async (_name, value, text, ownStyle, producer) => {
    if (!plainRenders.has(producer.name)) {
      plainRenders.set(producer.name, renderProducer(producer, "M"));
    }
    const plain = await plainRenders.get(producer.name)!;
    const at = plain.findIndex(({ char }) => char === "M");
    expect(at).toBeGreaterThanOrEqual(0);
    const before = plain.slice(0, at);
    const after = plain.slice(at + 1);
    const cells = await renderProducer(producer, value);
    const middle = cells.slice(before.length, cells.length - after.length);
    expect(show(cells.slice(0, before.length))).toBe(show(before));
    expect(show(cells.slice(cells.length - after.length))).toBe(show(after));
    expect(middle.some(({ char }) => isCodeCharacter(char))).toBe(false);
    const valueStyle = [
      ...new Set([...plain[at]!.style.split(" "), ...ownStyle.split(" ")]),
    ]
      .filter(Boolean)
      .sort()
      .join(" ");
    expect(show(middle)).toBe(
      show([...text].map((char) => ({ char, style: valueStyle }))),
    );
  });
});
