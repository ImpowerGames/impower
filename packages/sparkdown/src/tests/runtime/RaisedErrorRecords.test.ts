// #815 — the story reports each runtime error with a record of how it was
// raised: the message without the location prefix, and the path of the content
// that raised it. An error `pcall` trapped is not reported, and the error after
// it is reported with its own record. The records sit beside `currentErrors` by
// index, and `pcall` trims `currentErrors` from the end when it traps an error
// recorded there, so the error added next must take the trapped one's record
// slot; the second test pins that on the state directly.

import { describe, expect, test } from "vitest";
import type { RaisedError } from "../../inkjs/engine/Error";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  const reports: { message: string; raised: RaisedError | null | undefined }[] = [];
  ctx.story.onError = (message, _type, _source, raised) => {
    reports.push({ message, raised });
  };
  ctx.story.ContinueMaximally();
  return { ctx, reports };
}

describe("raised error records", () => {
  test("an error after one pcall trapped is reported with its own record", () => {
    const { ctx, reports } = run(`& run()
done

function run()
  local ok = pcall(assert, false, "trapped")
  error("after")
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(reports.map((r) => r.raised?.message)).toEqual(["after"]);
    expect(reports[0]!.message).toMatch(/after$/);
    expect(reports[0]!.raised?.path).toMatch(/^run\./);
  });

  test("the error added after a trim takes the trimmed one's record slot", () => {
    const { ctx } = run(`A\n`);
    const state = ctx.story.state;
    state.AddError("first", false, { message: "first", path: "0.1" });
    state.AddError("second", false, { message: "second", path: "0.2" });
    // What `pcall` does when it traps the second.
    state.currentErrors!.length = 1;
    state.AddError("third", false, { message: "third", path: "0.3" });
    expect(state.currentErrors).toEqual(["first", "third"]);
    expect(state.raisedErrors.slice(0, 2)).toEqual([
      { message: "first", path: "0.1" },
      { message: "third", path: "0.3" },
    ]);
  });
});
