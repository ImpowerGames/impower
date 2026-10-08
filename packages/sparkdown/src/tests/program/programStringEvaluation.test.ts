// #1134 — the program engine's state tells whether its output is inside a
// string evaluation without walking the output stream on every push.
//
// Every push asks `inStringEvaluation`. Inside an interpolation the
// `BeginString` sits before everything the evaluation pushes, so a scan from
// the end reached it only after the whole stream, and a loop that kept
// pushing inside `{...}` cost more with every step. The state is driven
// directly here, with the call stack of an empty story, so that the reads of
// the stream can be counted.
import { Container } from "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { ControlCommand } from "../../runtime/ControlCommand";
import type { InkObject } from "../../runtime/Object";
import { Story } from "../../inkjs/engine/Story";
import { StringValue } from "../../runtime/Value";
import { ProgramStoryState } from "../../program/ProgramStoryState";

const newState = () => {
  const story = new Story(new Container(), null, null);
  story.ResetState(false);
  return new ProgramStoryState(
    null as never,
    null as never,
    (text) => text,
    () => {},
    story.state.callStack,
  );
};

/** Counts the entries of `state`'s output stream that are read. */
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
    // A walk of the stream on each push reads about pushes^2 / 2 entries.
    expect(counter.reads).toBeLessThan(pushes * 4);
  });

  it("follows the stream as strings open, close and the stream is rewritten", () => {
    const state = newState();
    expect(state.inStringEvaluation).toBe(false);
    state.PushToOutputStream(new StringValue("Hello"));
    expect(state.inStringEvaluation).toBe(false);

    // An outer string, then an inner one inside it.
    state.PushToOutputStream(ControlCommand.BeginString());
    state.PushToOutputStream(new StringValue("a"));
    expect(state.inStringEvaluation).toBe(true);
    state.PushToOutputStream(ControlCommand.BeginString());
    state.PushToOutputStream(new StringValue("b"));
    expect(state.inStringEvaluation).toBe(true);

    // Closing the inner string leaves the outer one open.
    state.PopFromOutputStream(2);
    expect(state.inStringEvaluation).toBe(true);
    // Closing the outer one leaves none.
    state.PopFromOutputStream(2);
    expect(state.inStringEvaluation).toBe(false);

    // A string opened at a later index than the one found before.
    state.PushToOutputStream(new StringValue("x"));
    state.PushToOutputStream(ControlCommand.BeginString());
    expect(state.inStringEvaluation).toBe(true);

    // A reset to output with no string, then to output with one.
    state.ResetOutput([new StringValue("y")]);
    expect(state.inStringEvaluation).toBe(false);
    state.ResetOutput([ControlCommand.BeginString(), new StringValue("z")]);
    expect(state.inStringEvaluation).toBe(true);

    // A command other than `BeginString` where one was found is not one.
    state.outputStream = [ControlCommand.EndString(), new StringValue("z")];
    expect(state.inStringEvaluation).toBe(false);
  });
});
