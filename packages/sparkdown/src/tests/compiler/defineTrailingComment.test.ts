import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf } from "../program/programHarness";

const script = `define thing with
  count = 5 -- note
  hidden = false -- for now
  label = "x" --[[ why ]]
  ["key"] = 2 -- bracket key
end

{type(thing.count)} {thing.count + 1} {type(thing.hidden)} {thing.hidden} {thing.label} {thing.key}
`;

describe("a define property with a trailing comment", () => {
  test("keeps its typed value in the context and at runtime", () => {
    const { program } = compileScript(script);
    expect(errorsOf(program)).toEqual([]);
    expect(program.context?.["thing"]?.["$default"]).toMatchObject({
      count: 5,
      hidden: false,
      label: "x",
      key: 2,
    });
    const story = new ProgramStory(program.chunks!);
    const errors: string[] = [];
    story.onError = (message: string) => errors.push(message);
    expect(story.ContinueMaximally().trim()).toBe("number 6 boolean false x 2");
    expect(errors).toEqual([]);
  });
});
