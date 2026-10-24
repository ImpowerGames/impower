import { describe, expect, it } from "vitest";
import { labelsAt } from "./completionHarness";

// `[[play NAME]]` plays the video NAME as a full-screen cutscene (I-1379):
// inside `[[ ]]` the name after `play` is a video, and the clauses a cutscene
// takes are `loop`, `mute` and `with`. Inside `(( ))` `play` stays the audio
// verb, whose target is a channel and whose names are sounds.

const program = {
  context: {
    video: { intro: { $type: "video", $name: "intro" } },
    image: { bunny: { $type: "image", $name: "bunny" } },
    audio: { theme: { $type: "audio", $name: "theme" } },
    channel: { music: { $type: "channel", $name: "music" } },
    transition: { fade: { $type: "transition", $name: "fade" } },
  },
} as any;

const complete = (source: string) => labelsAt(source, { program }).sort();

describe("[[play NAME]] completions", () => {
  it("offers `play` among the verbs inside [[ ]]", () => {
    expect(complete("[[@0]]")).toContain("play");
  });

  it("offers video names, and only video names, after `play`", () => {
    expect(complete("[[play @0]]")).toEqual(["intro"]);
    expect(complete("[[play in@0]]")).toEqual(["intro"]);
  });

  it("offers `loop`, `mute` and `with` after the name", () => {
    expect(complete("[[play intro @0]]")).toEqual(["loop", "mute", "with"]);
  });

  it("offers only the cutscene clauses after a clause", () => {
    expect(complete("[[play intro loop @0]]")).not.toContain("over");
    expect(complete("[[play intro loop @0]]")).toEqual(
      expect.arrayContaining(["mute", "with"]),
    );
  });

  it("offers transitions after `with`", () => {
    expect(complete("[[play intro with @0]]")).toEqual(["fade"]);
  });

  it("still offers channels then sounds after `play` inside (( ))", () => {
    expect(complete("((play @0))")).toEqual(["music"]);
    expect(complete("((play music @0))")).toContain("theme");
    expect(complete("((play music @0))")).not.toContain("intro");
  });
});
