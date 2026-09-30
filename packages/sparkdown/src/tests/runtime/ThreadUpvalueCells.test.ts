// #1126 — a closure over a variable a `<-` thread also binds.
//
// A `<-` thread, and the thread a choice continues on, start as copies of the
// thread that made them, so each copy binds its own copy of the variables in
// scope. A closure's upvalue cell reads the binding of whichever thread holds
// it: the parent while it still binds the variable, a taken choice's thread
// once that replaces the parent, and a finished thread's own value once the
// thread ends.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  test("a choice from a `<-` thread started while an inner local shadows the captured name reads the captured variable", () => {
    const run = chooseFirst(`store get = nil
-> main
scene main
  & local x = "outer"
  & get = function() return x end
  do
    local x = "inner"
    <- side
  end
  done
end
scene side
  choose
    * Pick
      Result {get()}.
      fin
  end
  done
end
`);
    expect(run.errors).toEqual([]);
    expect(run.afterChoice).toBe("Pick\nResult outer.\n");
    expect(run.afterLoad).toBe("Pick\nResult outer.\n");
  });

  test("a save the engine wrote before cells recorded their scope reopens a borrowed cell for the taken choice", () => {
    // Written by the engine at `writtenBy` at `Mid.`, inside the block,
    // while the pending choice's thread still borrowed the open cell. That
    // engine printed `afterChoosingFirstThere` after loading it.
    const fixture = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "fixtures",
          "saves",
          "thread-borrowed-cells-before-scopes.json",
        ),
        "utf8",
      ),
    );
    expect(JSON.stringify(fixture.save)).toContain('"borrowedUpvalues"');
    expect(JSON.stringify(fixture.save)).not.toContain('"si"');
    const { compiledJson, errorMessages } = makeRuntimeStoryFromSource(
      fixture.source,
    );
    const errors = [...errorMessages];
    const story = new RuntimeStory(compiledJson as Record<string, any>);
    story.onError = (m: string) => errors.push(m);
    story.state.LoadJson(JSON.stringify(fixture.save));
    story.ContinueMaximally();
    story.ChooseChoiceIndex(0);
    expect(story.ContinueMaximally()).toBe("Pick\nResult 5.\n");
    expect(errors).toEqual([]);
  });
});

describe("closures over a variable an inner local of the same name shadows", () => {
  test("the closure reads the variable it captured, not the shadowing local", () => {
    const run = straightAndRestored(`-> main
scene main
  & local x = "outer"
  & local get = function() return x end
  First.
  do
    local x = "inner"
    Read {get()}.
  end
  After {get()}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.straight).toBe("First.\nRead outer.\nAfter outer.\n");
    expect(run.restored).toBe("First.\nRead outer.\nAfter outer.\n");
  });

  test("the closure writes the variable it captured, not the shadowing local", () => {
    const run = straightAndRestored(`-> main
scene main
  & local x = "outer"
  & local set = function(v) x = v end
  First.
  do
    local x = "inner"
    & set("written")
    Inner {x}.
  end
  Outer {x}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.straight).toBe("First.\nInner inner.\nOuter written.\n");
    expect(run.restored).toBe("First.\nInner inner.\nOuter written.\n");
  });

  test("the captured variable's cell stays open when the shadowing block ends", () => {
    const run = straightAndRestored(`store get = nil
-> main
scene main
  do
    local x = "outer"
    get = function() return x end
    First.
    do
      local x = "inner"
    end
    x = "changed"
  end
  Result {get()}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.straight).toBe("First.\nResult changed.\n");
    expect(run.restored).toBe("First.\nResult changed.\n");
  });

  test("a closure over the shadowing local gets a cell of its own", () => {
    const run = straightAndRestored(`-> main
scene main
  & local x = "outer"
  & local getOuter = function() return x end
  First.
  do
    local x = "inner"
    local getInner = function() return x end
    x = "inner2"
    Both {getOuter()} {getInner()}.
  end
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.straight).toBe("First.\nBoth outer inner2.\n");
    expect(run.restored).toBe("First.\nBoth outer inner2.\n");
  });

  test("a save the engine wrote before cells recorded their scope keeps the captured variable when a later local shadows it", () => {
    // Written by the engine at `writtenBy` at `First.`, before the inner
    // block. That engine printed `restThere` after loading it.
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, "fixtures", "saves", "closure-cells-before-scopes.json"),
        "utf8",
      ),
    );
    expect(JSON.stringify(fixture.save)).toContain('"upvalues"');
    expect(JSON.stringify(fixture.save)).not.toContain('"si"');
    const { compiledJson, errorMessages } = makeRuntimeStoryFromSource(
      fixture.source,
    );
    const errors = [...errorMessages];
    const story = new RuntimeStory(compiledJson as Record<string, any>);
    story.onError = (m: string) => errors.push(m);
    story.state.LoadJson(JSON.stringify(fixture.save));
    expect(story.ContinueMaximally()).toBe("Read outer.\nAfter outer.\n");
    expect(errors).toEqual([]);
  });
});

describe("closures shared by several threads and choices", () => {
  test("the taken one of two pending choices from a `<-` thread reads what it writes", () => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(`store get = nil
-> main
scene main
  do
    local x = 1
    get = function() return x end
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
    * Other
      & x = 7
      Other {get()}.
      fin
  end
  done
end
`);
    const errors = [...errorMessages];
    story.onError = (m: string) => errors.push(m);
    story.ContinueMaximally();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Pick", "Other"]);
    story.ChooseChoiceIndex(1);
    expect(story.ContinueMaximally()).toBe("Other\nOther 7.\n");
    expect(errors).toEqual([]);
  });

  test("a choice from a `<-` thread started by another `<-` thread reads what it writes", () => {
    const run = chooseFirst(`store get = nil
-> main
scene main
  do
    local x = 1
    get = function() return x end
    <- middle
  end
  done
end
scene middle
  <- side
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
});
