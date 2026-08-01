// Binary writer equivalence (#314 phase 2).
//
// The gate: driving `Story.ToJson` with ProgramBinaryWriter must produce the
// same program as driving it with SimpleJson.Writer. Anything less and the
// binary path silently diverges from the JSON path it is meant to replace —
// which is exactly the failure the JSON fallback exists to bisect.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { SimpleJson } from "../../inkjs/engine/SimpleJson";
import { materializeNode } from "../../binary/programBinary";
import {
  ProgramBinaryWriter,
  createProgramTable,
} from "../../binary/ProgramBinaryWriter";

const URI = "inmemory:///main.sd";

function compileToJson(text: string) {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    const c = new SparkdownCompiler();
    c.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    return (c.compile({ textDocument: { uri: URI } } as never) as any).program
      .compiled;
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

/** Exercises the shapes the writer has to get exactly right. */
function corpus(): string {
  const L: string[] = [];
  L.push("title: Writer Equivalence");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push("");
  L.push("const LIMIT = 3");
  L.push("store trust = 0");
  L.push("store ratio = 0.5");
  L.push("store whole = 2.0");
  L.push("list mood = (calm), tense");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  for (let s = 0; s < 5; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action ${s} with {trust} and {LIMIT}.`);
    L.push("hero:");
    L.push(`  Line ${s} — dash and {ratio}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: Trusted ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet ${s}.`);
    L.push("end");
    L.push("& trust = bonus(trust)");
    L.push(`-> scene_${(s + 1) % 5}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

/** What SimpleJson.Writer produces for the same story. */
function viaJsonWriter(story: RuntimeStory): unknown {
  const writer = new SimpleJson.Writer();
  story.ToJson(writer);
  return writer.toObject();
}

/** What ProgramBinaryWriter produces, materialized back for comparison. */
function viaBinaryWriter(story: RuntimeStory): unknown {
  const writer = new ProgramBinaryWriter();
  story.ToJson(writer as never);
  return materializeNode(writer.toBuffer());
}

describe("ProgramBinaryWriter", () => {
  it("emits the same program as SimpleJson.Writer", () => {
    const compiled = compileToJson(corpus());
    expect(compiled, "corpus must compile").toBeTruthy();
    const story = new RuntimeStory(compiled);
    // Key ORDER is compared, not just structure: the program is compared as
    // serialized text elsewhere in the pipeline, so an order-insensitive match
    // would hide real drift.
    expect(JSON.stringify(viaBinaryWriter(story))).toBe(
      JSON.stringify(viaJsonWriter(story)),
    );
  });

  it("produces a story that itself re-serializes identically", () => {
    const compiled = compileToJson(corpus());
    const story = new RuntimeStory(compiled);
    const rebuilt = new RuntimeStory(viaBinaryWriter(story) as never);
    expect(JSON.stringify(viaJsonWriter(rebuilt))).toBe(
      JSON.stringify(viaJsonWriter(story)),
    );
  });

  it("preserves the float markers the loader depends on", () => {
    // "3.0f" / "inff" / "nanf" are load-bearing: without them a whole-number
    // float reloads as an IntValue and `7 / 3.0` degrades to integer division.
    const w = new ProgramBinaryWriter();
    w.WriteArrayStart();
    w.WriteFloat(3.0);
    w.WriteFloat(0.5);
    w.WriteFloat(Number.POSITIVE_INFINITY);
    w.WriteFloat(Number.NEGATIVE_INFINITY);
    w.WriteFloat(NaN);
    w.WriteInt(7.9);
    w.WriteBool(true);
    w.WriteNull();
    w.WriteArrayEnd();
    expect(materializeNode(w.toBuffer())).toEqual([
      "3.0f",
      0.5,
      "inff",
      "-inff",
      "nanf",
      7, // WriteInt floors, matching SimpleJson
      true,
      null,
    ]);
  });

  it("writes nothing for a null number, exactly like SimpleJson", () => {
    // SimpleJson's WriteInt/WriteFloat/WriteBool return early on null, leaving
    // the property with no value. The binary buffer has no way to express a
    // childless Member, so it must fill one in rather than emit a corrupt
    // record whose `end` implies a child that is not there.
    const w = new ProgramBinaryWriter();
    w.WriteObjectStart();
    w.WriteIntProperty("missing", null as never);
    w.WriteIntProperty("present", 4);
    w.WriteObjectEnd();
    expect(materializeNode(w.toBuffer())).toEqual({
      missing: null,
      present: 4,
    });
  });

  it("round-trips a captured chunk through splice", () => {
    // The phase 2 mechanism: capture a subtree, then splice it into a DIFFERENT
    // writer and get the same value back. Both writers SHARE the table, which
    // is what makes the chunk a plain record copy — that sharing is the
    // invariant, so the test exercises it rather than working around it.
    const table = createProgramTable();
    const source = new ProgramBinaryWriter(table);
    source.WriteObjectStart();
    source.WritePropertyStart("flow");
    const mark = source.mark();
    source.WriteArrayStart();
    source.Write("ev");
    source.Write(42);
    source.WriteObjectStart();
    source.WriteProperty("->", "target.path");
    source.WriteObjectEnd();
    source.Write("/ev");
    source.WriteArrayEnd();
    const chunk = source.captureChunk(mark);
    source.WritePropertyEnd();
    source.WriteObjectEnd();

    // A second writer that writes DIFFERENT content before the splice, so a
    // chunk holding absolute end indices would land its subtree bounds in the
    // wrong place. Sizes are relative, so it survives.
    const target = new ProgramBinaryWriter(table);
    target.WriteObjectStart();
    target.WriteProperty("decoy", "unrelated");
    target.WriteIntProperty("another", 999);
    target.WritePropertyStart("flow");
    target.WriteInjected(chunk);
    target.WritePropertyEnd();
    target.WriteObjectEnd();

    expect(materializeNode(target.toBuffer())).toEqual({
      decoy: "unrelated",
      another: 999,
      flow: ["ev", 42, { "->": "target.path" }, "/ev"],
    });
  });

  it("captures a chunk from a real story flow and splices it back", () => {
    const compiled = compileToJson(corpus());
    const story = new RuntimeStory(compiled);
    const expected = JSON.stringify(viaJsonWriter(story));

    // Serialize once, arming a capture for every top-level flow...
    const table = createProgramTable();
    const first = new ProgramBinaryWriter(table);
    story.ToJson(first as never, {
      resolve: (name: string, _container: unknown, serialize: () => unknown) => {
        first.captureNextInjectedAs(name, "fp");
        return serialize();
      },
    } as never);
    const chunks = first.takeCapturedChunks();
    expect(chunks.size, "corpus must have top-level flows").toBeGreaterThan(0);
    expect(JSON.stringify(materializeNode(first.toBuffer()))).toBe(expected);

    // ...then serialize again reusing every chunk, and expect the same program.
    // This is the phase 2 claim: a flow that did not change is spliced from
    // records instead of re-walked, with no observable difference.
    const second = new ProgramBinaryWriter(table);
    story.ToJson(second as never, {
      resolve: (name: string) => chunks.get(name)!.chunk,
    } as never);
    expect(JSON.stringify(materializeNode(second.toBuffer()))).toBe(expected);
  });
});
