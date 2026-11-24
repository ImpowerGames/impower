import { describe, expect, test } from "vitest";
import { parseMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { createHarness, flattenMessages } from "./harness/uiTestHarness";

const face = (smile: string, frown: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<g data-name="mouth.smile default"><path data-name="lip" d="${smile}" fill="#a33"/></g>
<g data-name="mouth.frown"><path data-name="lip" d="${frown}" fill="#a33"/></g>
</svg>`;

const SMILE = "M10,50 C30,80 70,80 90,50 C70,60 30,60 10,50Z";
const FROWN = "M10,60 C30,30 70,30 90,60 C70,50 30,50 10,60Z";

const ASSETS = [
  { uri: "inmemory:///mia.svg", type: "image", name: "mia", ext: "svg", data: face(SMILE, FROWN) },
  { uri: "inmemory:///tom.svg", type: "image", name: "tom", ext: "svg", data: face(SMILE, FROWN) },
] as any[];

const BEND = `morph bend {
  method = match
  timing {
    trigger = change
    duration = 0.5
    easing = linear
  }
}
`;

const SOURCE = `${BEND}

scene start
  [[show portrait mia:mouth.smile]]
  Mia smiles.
  [[show portrait mia:mouth.frown]]
  Then she does not.
  [[show portrait mia:mouth.frown]]
  She keeps frowning.
  [[show portrait tom:mouth.smile]]
  Tom smiles.
end
`;

async function beats(instant: (index: number) => boolean = () => false, source = SOURCE, count = 4, warnings: string[] = []) {
  const harness = createHarness(source, 0, { assets: ASSETS });
  (harness.game as any)._context.system.log = (message: unknown, severity: string) => {
    if (severity === "warning") warnings.push(String(message));
  };
  await harness.ready;
  harness.jumpToFlow("start");
  const writes: any[] = [];
  for (let index = 0; index < count; index++) {
    harness.reset();
    await harness.display(harness.nextBeat()!, instant(index));
    const write = flattenMessages(harness.messages).find(
      (message: any) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length,
    );
    writes.push(write?.params.instructions[0].content);
  }
  return writes;
}

describe("a `trigger = change` morph in the image write (#2737)", () => {
  test("a change of options on the portrait on screen plays the morph once, from the old state to the new one", async () => {
    const [first, changed] = await beats();
    expect(first.morph).toBeUndefined();
    const plays = changed.morph.plays;
    expect(plays.map((play: any) => [play.morph, play.timing.trigger, play.timing.duration])).toEqual([["bend", "change", 0.5]]);
    const ref = plays[0].ref;
    expect(ref).toMatchObject({ morphs: ["bend"], image: "mia", groups: ["mouth"] });
    const recipe = parseMorphRecipe(ref.recipes.bend);
    expect(recipe).toMatchObject({
      name: "bend",
      method: "match",
      keyframes: [
        { offset: 0, states: { mouth: "smile" } },
        { offset: 1, states: { mouth: "frown" } },
      ],
    });
    expect(decodeURIComponent(changed.background)).toContain("mouth.frown");
    expect(decodeURIComponent(changed.morph.still)).toContain("mouth.smile");
  });

  test("showing the same options again, or a different picture, plays nothing", async () => {
    const [, , same, other] = await beats();
    expect(same.morph).toBeUndefined();
    expect(other.morph).toBeUndefined();
  });

  test("a named look built on the portrait is the same portrait", async () => {
    const source = SOURCE.replace(
      "scene start",
      `define mia_glum as filtered_image with\n  image = image.mia\n  attributes = { "mouth.frown" }\nend\n\nscene start`,
    ).replace("[[show portrait mia:mouth.frown]]\n  Then", "[[show portrait mia_glum]]\n  Then");
    const [, changed] = await beats(undefined, source, 2);
    expect(changed.morph.plays.map((play: any) => play.morph)).toEqual(["bend"]);
    expect(changed.morph.plays[0].ref.groups).toEqual(["mouth"]);
  });

  test("two change morphs that could play on one change share its groups, so neither plays and a warning names them", async () => {
    const warnings: string[] = [];
    const [, changed] = await beats(undefined, SOURCE.replace("scene start", `${BEND.replace("morph bend", "morph sway")}\nscene start`), 2, warnings);
    expect(changed.morph).toBeUndefined();
    expect(warnings).toEqual([expect.stringContaining("`bend`, `sway` share group `mouth`")]);
  });

  test("a beat displayed at once shows the new drawing with no play", async () => {
    const [, changed] = await beats((index) => index === 1);
    expect(changed.morph).toBeUndefined();
    expect(decodeURIComponent(changed.background)).toContain("mouth.frown");
  });
});
