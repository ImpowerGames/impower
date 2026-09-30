// #1126 — a closure over a variable a `<-` thread also binds.
//
// A `<-` thread, and the thread a choice continues on, start as copies of the
// thread that made them, so each copy binds its own copy of the variables in
// scope. A closure's upvalue cell reads the binding of whichever thread holds
// it: the parent while it still binds the variable, a taken choice's thread
// once that replaces the parent, and a finished thread's own value once the
// thread ends.

import { describe, expect, test } from "vitest";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// Runs to the first choice, takes it and runs the rest; again from a save
// taken at the choice, loaded into a fresh story.
function chooseFirst(source: string): {
  beforeChoice: string;
  afterChoice: string;
  afterLoad: string;
  errors: string[];
} {
  const { story, errorMessages, compiledJson } =
    makeRuntimeStoryFromSource(source);
  const errors = errorMessages.map((m) => `[compile] ${m}`);
  story.onError = (m: string) => errors.push(`[straight] ${m}`);
  const beforeChoice = story.ContinueMaximally();
  expect(story.currentChoices.map((c) => c.text)).toEqual(["Pick"]);
  const savedJson = story.state.ToJson();
  story.ChooseChoiceIndex(0);
  const afterChoice = story.ContinueMaximally();

  const again = new RuntimeStory(compiledJson as Record<string, any>);
  again.onError = (m: string) => errors.push(`[after load] ${m}`);
  again.state.LoadJson(savedJson);
  again.ChooseChoiceIndex(0);
  const afterLoad = again.ContinueMaximally();
  return { beforeChoice, afterChoice, afterLoad, errors };
}

// Runs straight through; again with a save after the first line, loaded into
// a fresh story that runs the rest.
function straightAndRestored(source: string): {
  straight: string;
  restored: string;
  errors: string[];
} {
  const { story, errorMessages, compiledJson } =
    makeRuntimeStoryFromSource(source);
  const errors = errorMessages.map((m) => `[compile] ${m}`);
  story.onError = (m: string) => errors.push(`[straight] ${m}`);
  const straight = story.ContinueMaximally();

  const { story: saving } = makeRuntimeStoryFromSource(source);
  saving.onError = (m: string) => errors.push(`[before save] ${m}`);
  const first = saving.Continue() ?? "";
  const savedJson = saving.state.ToJson();
  const again = new RuntimeStory(compiledJson as Record<string, any>);
  again.onError = (m: string) => errors.push(`[after load] ${m}`);
  again.state.LoadJson(savedJson);
  const restored = first + again.ContinueMaximally();
  return { straight, restored, errors };
}

describe("closures over variables a `<-` thread also binds", () => {
  test("a taken choice from a `<-` thread started in a block writes the variable the closure reads", () => {
    const run = chooseFirst(`-> main
scene main
  & local x = 0
  do
    local x = 1
    local get = function() return x end
    <- side
  end
  done
end
scene side
  choose
    * Pick
      & x = 5
      Result {get()}.
      fin
  end
  done
end
`);
    expect(run.errors).toEqual([]);
    expect(run.afterChoice).toBe("Pick\nResult 5.\n");
    expect(run.afterLoad).toBe("Pick\nResult 5.\n");
  });

  test("the parent still reads its own value after leaving the block, before the choice is taken", () => {
    const run = chooseFirst(`store get = nil
store set = nil
-> main
scene main
  & local x = 0
  do
    local x = 1
    get = function() return x end
    set = function(v) x = v end
    <- side
  end
  & set(3)
  Main {get()}.
  done
end
scene side
  choose
    * Pick
      Before {get()}.
      & x = 5
      Result {get()}.
      fin
  end
  done
end
`);
    expect(run.errors).toEqual([]);
    expect(run.beforeChoice).toBe("Main 3.\n");
    expect(run.afterChoice).toBe("Pick\nBefore 1.\nResult 5.\n");
    expect(run.afterLoad).toBe("Pick\nBefore 1.\nResult 5.\n");
  });

  test("a closure a `<-` thread makes over its own local keeps that value after the thread ends", () => {
    const run = straightAndRestored(`store f = nil
-> main
scene main
  & local x = 1
  <- side
  First.
  Result {f()}.
  fin
end
scene side
  & local x = 2
  & f = function() return x end
  done
end
`);
    expect(run.errors).toEqual([]);
    expect(run.straight).toBe("First.\nResult 2.\n");
    expect(run.restored).toBe("First.\nResult 2.\n");
  });

  test("a taken choice from a `<-` thread reads the thread's own local its closure captured", () => {
    const run = chooseFirst(`store f = nil
-> main
scene main
  & local x = 1
  <- side
  Main {f()}.
  done
end
scene side
  & local x = 2
  & f = function() return x end
  choose
    * Pick
      & x = 7
      Result {f()}.
      fin
  end
  done
end
`);
    expect(run.errors).toEqual([]);
    expect(run.beforeChoice).toBe("Main 2.\n");
    expect(run.afterChoice).toBe("Pick\nResult 7.\n");
    expect(run.afterLoad).toBe("Pick\nResult 7.\n");
  });

  test("a taken choice from a `<-` thread that declared its own same-named local keeps the parent's variable in the closure", () => {
    const run = chooseFirst(`store get = nil
-> main
scene main
  & local x = 1
  & get = function() return x end
  <- side
  Main {get()}.
  done
end
scene side
  & local x = 2
  choose
    * Pick
      Result {get()} {x}.
      fin
  end
  done
end
`);
    expect(run.errors).toEqual([]);
    expect(run.beforeChoice).toBe("Main 1.\n");
    expect(run.afterChoice).toBe("Pick\nResult 1 2.\n");
    expect(run.afterLoad).toBe("Pick\nResult 1 2.\n");
  });
});
