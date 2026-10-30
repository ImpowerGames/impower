import { describe, expect, it } from "vitest";
import { ControlCommand } from "../../runtime/ControlCommand";
import type { InkObject } from "../../runtime/Object";
import { CallStack } from "../../runtime/CallStack";
import { StringValue } from "../../runtime/Value";
import { ProgramStoryState } from "../../program/ProgramStoryState";

const newState = () =>
  new ProgramStoryState(
    null as never,
    null as never,
    (text) => text,
    () => {},
    CallStack.ForProgram(),
  );

const countReads = (state: ProgramStoryState) => {
  const counter = { reads: 0 };
  state.outputStream = new Proxy(state.outputStream, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) counter.reads += 1;
      return Reflect.get(target, key, receiver);
    },
  }) as InkObject[];
  return counter;
};

describe("a string evaluation in the program engine's output", () => {
  it("costs the same to extend however long it has grown", () => {
    const state = newState();
    state.PushToOutputStream(new StringValue("Spinning "));
    state.PushToOutputStream(ControlCommand.BeginString());
    const counter = countReads(state);
    const pushes = 20_000;
    for (let i = 0; i < pushes; i++) {
      state.PushToOutputStream(new StringValue("\n"));
    }
    expect(state.inStringEvaluation).toBe(true);
    expect(counter.reads).toBeLessThan(pushes * 4);
  });

  it("follows the stream as strings open, close and the stream is rewritten", () => {
    const state = newState();
    expect(state.inStringEvaluation).toBe(false);
    state.PushToOutputStream(new StringValue("Hello"));
    expect(state.inStringEvaluation).toBe(false);

    state.PushToOutputStream(ControlCommand.BeginString());
    state.PushToOutputStream(new StringValue("a"));
    expect(state.inStringEvaluation).toBe(true);
    state.PushToOutputStream(ControlCommand.BeginString());
    state.PushToOutputStream(new StringValue("b"));
    expect(state.inStringEvaluation).toBe(true);

    state.PopFromOutputStream(2);
    expect(state.inStringEvaluation).toBe(true);
    state.PopFromOutputStream(2);
    expect(state.inStringEvaluation).toBe(false);

    state.PushToOutputStream(new StringValue("x"));
    state.PushToOutputStream(ControlCommand.BeginString());
    expect(state.inStringEvaluation).toBe(true);

    state.ResetOutput([new StringValue("y")]);
    expect(state.inStringEvaluation).toBe(false);
    state.ResetOutput([ControlCommand.BeginString(), new StringValue("z")]);
    expect(state.inStringEvaluation).toBe(true);

    state.outputStream = [ControlCommand.BeginTag(), new StringValue("z")];
    expect(state.inStringEvaluation).toBe(false);
  });
});
