import { describe, expect, test } from "vitest";
import { buildMorphChannel, morphRefsForStruct } from "../../morph/channel";
import { parseMorphRecipe } from "../../morph/recipe";
import { MORPH_PICK_NONE } from "../../morph/types";

const data =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g data-name="mouth.smile default"><path data-name="lip" d="M0 0 L10 5 L20 0Z"/></g><g data-name="mouth.frown"><path data-name="lip" d="M0 5 L10 0 L20 5Z"/></g></svg>';
const look = (name: string, attribute: string) => ({ $type: "filtered_image", $name: name, image: { $type: "image", $name: "mia" }, attributes: [attribute] });
const smile = look("smile", "mouth.smile");
const frown = look("frown", "mouth.frown");
const context = { image: { mia: { $type: "image", $name: "mia", data } }, filtered_image: { smile, frown } };
const bend = { method: "match", timing: { trigger: "change" } };
const talk = {
  blend: "cut",
  timing: { trigger: "speech" },
  keyframes: [
    { offset: 0, mouth: { state: "smile" } },
    { offset: 1, mouth: { state: "frown" } },
  ],
};
const channel = buildMorphChannel(context, new Map<string, Record<string, unknown>>([["bend", bend], ["talk", talk]]));
const states = (refs: ReturnType<typeof morphRefsForStruct>) =>
  refs.flatMap((ref) => (ref.recipes?.["bend"] ? [parseMorphRecipe(ref.recipes["bend"])?.keyframes.map((frame) => frame.states)] : []));

describe("a change morph reads the old look with the pick its own directive made (#2737)", () => {
  test("the same options again, where no speech morph played, change nothing", () => {
    expect(states(morphRefsForStruct(context, channel, smile, MORPH_PICK_NONE, { struct: smile, pick: MORPH_PICK_NONE }))).toEqual([]);
  });

  test("other options, where no speech morph played, bend from the options that were shown", () => {
    expect(states(morphRefsForStruct(context, channel, frown, MORPH_PICK_NONE, { struct: smile, pick: MORPH_PICK_NONE }))).toEqual([
      [{ mouth: "smile" }, { mouth: "frown" }],
    ]);
  });

  test("a speech morph that played on the old look supplies the drawing the change starts from", () => {
    expect(states(morphRefsForStruct(context, channel, frown, MORPH_PICK_NONE, { struct: smile, pick: "talk" }))).toEqual([]);
    expect(states(morphRefsForStruct(context, channel, smile, MORPH_PICK_NONE, { struct: smile, pick: "talk" }))).toEqual([
      [{ mouth: "frown" }, { mouth: "smile" }],
    ]);
  });
});
