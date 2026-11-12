import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { channelRefs } from "../../morph/channel";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.closed:default" id="m-closed"/>
<g data-name="lips:mouth.open" id="m-open"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const speech = (name: string, peak: string, extra = "", head = `morph ${name} {`) => `${head}
  blend = cut
${extra}  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = ${peak}
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
  timing {
    trigger = speech
    duration = 0.16
  }
}
`;

const BLINK = `morph blink {
  blend = cut
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }
}
`;

const TALK = speech("talk", "open", "  default = true\n");
const GRITTED = `morph talk_gritted as talk {
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = teeth
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
}
`;

const story = (morphs: string, lines: string) => `${morphs}

scene start
${lines}
end
`;

function compile(text: string, images: Record<string, string> = { bunny: FACE }) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...Object.entries(images).map(([name, data]) => ({ uri: `file:///${name}.svg`, type: "image", name, ext: "svg", data })),
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function diagnosticsOf(text: string, images?: Record<string, string>) {
  const program = compile(text, images);
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      line: start.line,
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

const about = (text: string, pattern: RegExp, images?: Record<string, string>) =>
  diagnosticsOf(text, images).filter((d) => pattern.test(d.message));

describe("the `morph` clause and `default = true` (I-2112)", () => {
  test("the program lists every speech morph that plays on a look, and its write carries the default", () => {
    const program = compile(story(`${TALK}\n${GRITTED}\n${BLINK}`, "  [[bunny]]"));
    const channel = program.morphs!;
    expect(channel.speech).toEqual({ talk: { default: true }, talk_gritted: {} });
    const picks = channel.picks!["bunny"]!;
    expect(Object.keys(picks).sort()).toEqual(["none", "talk", "talk_gritted"]);
    expect(channel.variants["bunny"]!.flatMap((ref) => ref.morphs)).toEqual(["blink", "talk"]);
    expect(picks["talk_gritted"]!.flatMap((ref) => ref.morphs)).toEqual(["blink", "talk_gritted"]);
    expect(picks["none"]!.flatMap((ref) => ref.morphs)).toEqual(["blink"]);
    expect(new Set(Object.values(picks).flatMap((refs) => refs.map((ref) => ref.key))).size).toBe(3);
    expect(channelRefs(channel).map(({ ref }) => ref.morphs.join("+")).sort()).toEqual(["blink+talk", "blink+talk_gritted"]);
  });

  test("`default` is not inherited through `as`: the child is unmarked in the program and the morph context", () => {
    const program = compile(story(`${TALK}\n${GRITTED}`, "  [[bunny]]"));
    expect(program.morphs!.speech!["talk_gritted"]).toEqual({});
    expect((program.context as any).morph.talk.default).toBe(true);
    expect((program.context as any).morph.talk_gritted.default).toBeUndefined();
    expect(about(story(`${TALK}\n${GRITTED}`, "  [[bunny]]"), /nothing plays there/)).toEqual([]);
  });

  test("a child of a `default = true` morph that is not a speech morph is not reported for its parent's mark", () => {
    const text = story(
      `${BLINK.replace("morph blink {\n", "morph blink {\n  default = true\n")}\nmorph blink_slow as blink {\n  blend = fade\n}\n`,
      "  [[bunny]]",
    );
    const reported = about(text, /`default` marks the speech morph/);
    expect(reported).toEqual([
      expect.objectContaining({ severity: 1, text: "default", line: 1 }),
    ]);
  });

  test("`default` on a morph that is not a speech morph is an error on the field", () => {
    const text = story(BLINK.replace("morph blink {\n", "morph blink {\n  default = false\n"), "  [[bunny]]");
    expect(about(text, /`default` marks the speech morph/)).toEqual([
      expect.objectContaining({ severity: 1, text: "default" }),
    ]);
  });

  test("`default` takes `true` or `false`", () => {
    const text = story(speech("talk", "open", "  default = 1\n"), "  [[bunny]]");
    expect(about(text, /is not a `default`/)).toEqual([
      expect.objectContaining({ severity: 1, text: "1" }),
    ]);
  });

  test("a clause naming an unknown morph is an error on the clause", () => {
    const text = story(TALK, "  [[bunny morph nope]]");
    expect(about(text, /No morph named `nope`/)).toEqual([
      expect.objectContaining({ severity: 1, text: "nope" }),
    ]);
  });

  test("a word after the clause's name that is not a clause is an error on that word", () => {
    const text = story(`${TALK}\n${GRITTED}`, "  [[bunny morph talk gritted]]\n  [[bunny morph talk_gritted with fade]]\n  [[bunny morph none wait]]");
    const scene = text.split("\n").indexOf("scene start");
    expect(diagnosticsOf(text).filter((d) => d.line > scene)).toEqual([
      expect.objectContaining({ severity: 1, text: "gritted", message: expect.stringContaining("`gritted` is not a clause: `morph` takes one morph name") }),
    ]);
  });

  test("the whole clause tail is read from the directive's syntax: a tag is not a stray word, and a word after a flag is", () => {
    const lines = ["  [[bunny morph talk # note]]", "  [[bunny morph talk wait garbage]]", "  [[bunny with fade extra]]"];
    const text = story(`${TALK}\n${GRITTED}`, lines.join("\n"));
    const all = text.split("\n");
    const scene = all.indexOf("scene start");
    expect(diagnosticsOf(text).filter((d) => d.line > scene)).toEqual([
      expect.objectContaining({ severity: 1, line: all.indexOf(lines[1]!), text: "garbage", message: "`garbage` is not a clause, and `wait` takes no value." }),
      expect.objectContaining({ severity: 1, line: all.indexOf(lines[2]!), text: "extra", message: "`extra` is not a clause: `with` takes one value." }),
    ]);
  });

  test("a speech morph named like a clause word is picked as the interpreter reads it, and `morph` alone still needs a name", () => {
    const morphs = [TALK, speech("wait", "teeth", "", "morph wait as talk {"), speech("ease", "teeth", "", "morph ease as talk {")].join("\n");
    const lines = ["  [[bunny morph wait]]", "  [[bunny morph ease over 1s]]", "  [[bunny morph]]"];
    const text = story(morphs, lines.join("\n"));
    const all = text.split("\n");
    const scene = all.indexOf("scene start");
    expect(diagnosticsOf(text).filter((d) => d.line > scene)).toEqual([
      expect.objectContaining({ severity: 1, line: all.indexOf(lines[2]!), text: "morph", message: expect.stringContaining("`morph` needs the name of a speech morph") }),
    ]);
  });

  test("`morph = name` reads `=` as the morph, as the interpreter does: an error on `=` that shows the form, and the name after it is a stray word", () => {
    const text = story(`${TALK}\n${GRITTED}`, "  [[bunny morph = talk_gritted]]");
    const scene = text.split("\n").indexOf("scene start");
    expect(diagnosticsOf(text).filter((d) => d.line > scene)).toEqual([
      expect.objectContaining({ severity: 1, text: "=", message: expect.stringContaining("with no `=`: `morph talk_gritted`") }),
      expect.objectContaining({ severity: 1, text: "talk_gritted", message: expect.stringContaining("`morph` takes one morph name") }),
    ]);
  });

  test("a name with a clause word after a `-`, `.`, `:` or `~` is one name, and a tag before any clause is a tag", () => {
    const text = story(TALK, "  [[mia-morph]]\n  [[mia-morph with fade]]\n  [[bunny # note]]\n  [[bunny # note morph none]]");
    const scene = text.split("\n").indexOf("scene start");
    const after = diagnosticsOf(text, { bunny: FACE, "mia-morph": FACE }).filter((d) => d.line > scene);
    expect(after).toEqual([]);
    const qualified = story(TALK, "  [[bunny:mouth.morph]]\n  [[bunny~mouth.morph]]\n  [[bunny:mouth.morph with fade]]");
    const lines = qualified.split("\n");
    expect(
      diagnosticsOf(qualified, { bunny: FACE.replace("</svg>", `<g data-name="lips:mouth.morph" id="m-morph"/>\n</svg>`) })
        .filter((d) => d.line > lines.indexOf("scene start") && !/does not show/.test(d.message)),
    ).toEqual([]);
  });

  test("a word no clause takes in an audio directive is an error on that word", () => {
    const lines = ["  ((theme wait garbage))", "  ((theme with echo garbage))", "  ((play music theme loop with over))"];
    const text = story(TALK, lines.join("\n"));
    const all = text.split("\n");
    const scene = all.indexOf("scene start");
    const tail = diagnosticsOf(text).filter((d) => d.line > scene && /is not a clause|not part of a clause/.test(d.message));
    expect(tail).toEqual([
      expect.objectContaining({ severity: 1, line: all.indexOf(lines[0]!), text: "garbage", message: "`garbage` is not a clause, and `wait` takes no value." }),
      expect.objectContaining({ severity: 1, line: all.indexOf(lines[1]!), text: "garbage", message: "`garbage` is not a clause: `with` takes one value." }),
    ]);
  });

  test("a transition or an ease named like a clause word is a value of `with` or `ease`, not a clause", () => {
    const text = story(TALK, "  [[bunny with wait]]\n  [[bunny ease ease over 1s]]\n  [[bunny with over]]");
    const scene = text.split("\n").indexOf("scene start");
    const after = diagnosticsOf(text).filter((d) => d.line > scene);
    expect(after.filter((d) => /should be followed by|is not a clause|is a flag/.test(d.message))).toEqual([]);
  });

  test("a clause naming a morph that is not a speech morph is an error on the clause", () => {
    const text = story(`${TALK}\n${BLINK}`, "  [[bunny morph blink]]");
    expect(about(text, /`blink` is not a speech morph/)).toEqual([
      expect.objectContaining({ severity: 1, text: "blink" }),
    ]);
  });

  test("a clause naming a speech morph that plays on no image in the directive is a warning", () => {
    const smile = speech("talk_smile", "open", "  when = mouth.teeth\n");
    const text = story(`${TALK}\n${smile}`, "  [[bunny morph talk_smile]]\n  [[bunny:mouth.teeth morph talk_smile]]");
    expect(about(text, /plays on no image in this directive/)).toEqual([
      expect.objectContaining({ severity: 2, text: "talk_smile", line: text.split("\n").indexOf("  [[bunny morph talk_smile]]") }),
    ]);
  });

  test("`morph none`, and a clause naming a speech morph that plays there, are not reported", () => {
    const text = story(`${TALK}\n${GRITTED}`, "  [[bunny morph none]]\n  [[bunny morph talk_gritted]]\n  [[bunny with fade morph talk]]");
    const scene = text.split("\n").indexOf("scene start");
    expect(diagnosticsOf(text).filter((d) => d.line > scene)).toEqual([]);
  });

  test("the ambiguous case is reported once on each morph and names an image", () => {
    const text = story(`${speech("talk", "open")}\n${speech("talk_gritted", "teeth")}`, "  [[bunny]]\n  [[rabbit]]");
    const reported = about(text, /nothing plays there/, { bunny: FACE, rabbit: FACE });
    expect(reported.map((d) => d.text).sort()).toEqual(["talk", "talk_gritted"]);
    for (const d of reported) {
      expect(d.severity).toBe(2);
      expect(d.message).toContain("`talk` and `talk_gritted` play on `bunny` (and 1 more)");
      expect(d.message).toContain("none is marked `default = true`");
    }
  });

  test("the ambiguous case writes no reference: nothing is prepared for a look where nothing plays", () => {
    const program = compile(story(`${speech("talk", "open")}\n${speech("talk_gritted", "teeth")}`, "  [[bunny]]"));
    const channel = program.morphs!;
    expect(channel.variants["bunny"]).toBeUndefined();
    expect(channel.picks!["bunny"]!["none"]).toEqual([]);
    expect(channelRefs(channel).map(({ ref }) => ref.morphs)).toEqual([["talk"], ["talk_gritted"]]);
  });

  test("a morph ambiguous in different sets on different looks is still reported once", () => {
    const morphs = [
      speech("talk", "open"),
      speech("closed_talk", "open", "  unless = mouth.teeth\n"),
      speech("teeth_talk", "open", "  when = mouth.teeth\n"),
      `define bunny_teeth as filtered_image with\n  image = image.bunny\n  attributes = { "mouth.teeth" }\nend\n`,
    ].join("\n");
    const reported = about(story(morphs, "  [[bunny]]\n  [[bunny_teeth]]"), /nothing plays there/);
    expect(reported.map((d) => d.text).sort()).toEqual(["closed_talk", "talk", "teeth_talk"]);
    expect(reported.find((d) => d.text === "talk")!.message).toContain("(and 1 more)");
  });

  test("the same art in two images lists a reference for each, so each artwork gets its bake diagnostics", () => {
    const program = compile(story(TALK, "  [[bunny]]\n  [[rabbit]]"), { bunny: FACE, rabbit: FACE });
    const refs = channelRefs(program.morphs);
    expect(refs.map(({ variant }) => variant).sort()).toEqual(["bunny", "rabbit"]);
  });

  test("two morphs marked `default = true` on one look are the ambiguous case too", () => {
    const text = story(`${speech("talk", "open", "  default = true\n")}\n${speech("talk_gritted", "teeth", "  default = true\n")}`, "  [[bunny]]");
    const reported = about(text, /nothing plays there/);
    expect(reported).toHaveLength(2);
    expect(reported[0]!.message).toContain("`talk` and `talk_gritted` are all marked `default = true`");
  });

  test("the override warning is judged against the chosen morph", () => {
    const text = story(`${TALK}\n${GRITTED}`, "  [[bunny:mouth.teeth]]\n  [[bunny:mouth.teeth morph none]]");
    const lines = text.split("\n");
    const warned = about(text, /does not show/);
    expect(warned).toEqual([expect.objectContaining({ line: lines.indexOf("  [[bunny:mouth.teeth]]"), text: "mouth.teeth" })]);
    expect(warned[0]!.message).toContain("`talk` plays on this look");
  });
});
