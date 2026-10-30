import { describe, expect, test } from "vitest";
import type { RaisedError } from "../../runtime/Error";
import { rootOf } from "../programListing";
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
    const { ctx, reports } = run(`scene start
  & run()
  done
end

function run()
  local ok = pcall(assert, false, "trapped")
  error("after")
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(reports.map((r) => r.raised?.message)).toEqual(["after"]);
    expect(reports[0]!.message).toMatch(/after$/);
    expect(
      rootOf(ctx.root).sceneAt(reports[0]!.raised!.address!),
    ).toBe("run");
  });

  test("the error added after a trim takes the trimmed one's record slot", () => {
    const { ctx } = run(`scene start\n  A\nend\n`);
    const state = ctx.story.state;
    state.AddError("first", false, { message: "first", path: "0.1" });
    state.AddError("second", false, { message: "second", path: "0.2" });
    state.currentErrors!.length = 1;
    state.AddError("third", false, { message: "third", path: "0.3" });
    expect(state.currentErrors).toEqual(["first", "third"]);
    expect(state.raisedErrors.slice(0, 2)).toEqual([
      { message: "first", path: "0.1" },
      { message: "third", path: "0.3" },
    ]);
  });
});
