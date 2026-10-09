// The player's UI on the binary program's engine (#698), through the real web
// consumer: an event handler reaches its function through `EvaluateFunction`
// (a named function, the evaluator of a call and the evaluator of an inline
// closure), and a reactive binding re-evaluates when a handler changes the
// global it reads.
import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `store count = 0
layout main with
  column {
    text "Count {count}"
    button "Add" @click=add
    button "Add two" @click=add_by(2)
    button "Add three" @click={ count = count + 3 }
  }
end
function add()
  count = count + 1
end
function add_by(n)
  count = count + n
end
`;

describe("a layout on the program engine", () => {
  test("runs a clicked button's handler through EvaluateFunction and re-evaluates the binding it changed", async () => {
    const h = createDOMHarness(SOURCE, 0);
    await h.ready;
    await flushMicrotasks(10);
    const story = h.game.story as any;
    expect(story.constructor.name).toBe("ProgramStory");
    // Every function the game evaluates, by name.
    const evaluated: string[] = [];
    const evaluate = story.EvaluateFunction.bind(story);
    story.EvaluateFunction = (name: string, ...rest: unknown[]) => {
      evaluated.push(name);
      return evaluate(name, ...rest);
    };
    const text = () => h.overlay.querySelector(".main .text")?.textContent;
    const buttons = [
      ...h.overlay.querySelectorAll(".main .button"),
    ] as HTMLElement[];
    expect(text()).toBe("Count 0");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Add",
      "Add two",
      "Add three",
    ]);

    // A handler named by its function.
    buttons[0]!.click();
    await flushMicrotasks(10);
    expect(evaluated).toContain("add");
    expect(text()).toBe("Count 1");

    // A call handler, through its evaluator.
    evaluated.length = 0;
    buttons[1]!.click();
    await flushMicrotasks(10);
    expect(evaluated.some((name) => name.startsWith("__binding$"))).toBe(true);
    expect(text()).toBe("Count 3");

    // An inline closure, through its evaluator.
    evaluated.length = 0;
    buttons[2]!.click();
    await flushMicrotasks(10);
    expect(evaluated.some((name) => name.startsWith("__binding$"))).toBe(true);
    expect(text()).toBe("Count 6");
    expect(story.variablesState.$("count")).toBe(6);
  });
});
