// #664: a host that enters a scene by name (`ChoosePathString`, as the
// preview's scrub does) gives its parameters the arguments it passes, nil for
// each one it leaves out and an empty `...`, as a call does, so the state
// holds values its saves, the session save and the durable one, can write.
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const enter = (source: string, args: unknown[] = []) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.ChoosePathString("start", true, args);
  const text = ctx.story.ContinueMaximally();
  return { ctx, text, save: () => ctx.story.state.ToJson() as string };
};

describe("entering a scene by name binds its parameters", () => {
  test("control: a scene without parameters saves after it runs", () => {
    const { text, save } = enter("scene start\n  Hello.\nend\n");
    expect(text).toBe("Hello.\n");
    expect(save).not.toThrow();
  });

  test("a scene entered without its argument runs with it nil and saves", () => {
    const { text, save } = enter("scene start(first: string)\n  Hello {first}.\nend\n");
    expect(text).toBe("Hello nil.\n");
    expect(save).not.toThrow();
  });

  test("a scene entered without its variadic arguments runs with `...` empty and saves", () => {
    const { text, save } = enter(
      'scene start(...: string)\n  local first = ...\n  Hello {first}, {select("#", ...)}.\nend\n',
    );
    expect(text).toBe("Hello nil, 0.\n");
    expect(save).not.toThrow();
  });

  test("a scene entered with fewer arguments than parameters gives the rest nil and saves", () => {
    const { text, save } = enter(
      "scene start(first: string, second: string)\n  {first} and {second}.\nend\n",
      ["Ann"],
    );
    expect(text).toBe("Ann and nil.\n");
    expect(save).not.toThrow();
  });

  test("a scene entered with its argument binds it", () => {
    const { text, save } = enter("scene start(first: string)\n  Hello {first}.\nend\n", ["Ann"]);
    expect(text).toBe("Hello Ann.\n");
    expect(save).not.toThrow();
  });

  test("a variadic scene entered with arguments takes them all in `...`", () => {
    const { text, save } = enter(
      'scene start(...: string)\n  local first = ...\n  Hello {first}, {select("#", ...)}.\nend\n',
      ["Ann", "Bo"],
    );
    expect(text).toBe("Hello Ann, 2.\n");
    expect(save).not.toThrow();
  });

  test("the durable save of a scene entered without its argument writes, loads and runs on", () => {
    const source = "scene start(first: string)\n  Hello {first}.\n  Bye {first}.\nend\n";
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.keepBeatImages = true;
    ctx.story.ChoosePathString("start");
    expect(ctx.story.Continue()).toBe("Hello nil.\n");
    const saved = ctx.story.toSave();
    const other = makeRuntimeStoryFromSource(source);
    other.story.keepBeatImages = true;
    other.story.loadSave(saved);
    expect(other.story.currentText?.trim()).toBe("Hello nil.");
    expect(other.story.Continue()).toBe("Bye nil.\n");
  });

  test("the save of a scene entered without its argument loads", () => {
    const { save } = enter("scene start(first: string)\n  Hello {first}.\nend\n");
    const saved = save();
    const other = makeRuntimeStoryFromSource("scene start(first: string)\n  Hello {first}.\nend\n");
    expect(() => other.story.state.LoadJson(saved)).not.toThrow();
  });
});
