// Binary compiled-program format: round-trip equivalence (#314).
//
// The format must be a LOSSLESS carrier for the compiled program. The gate is
// not "the decoder returns something reasonable" — it is that a story built
// from the decoded program re-serializes byte-identically to the JSON the
// compiler produced. Anything less and the two paths can drift, which is the
// whole risk of keeping JSON as the fallback.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { SimpleJson } from "../../inkjs/engine/SimpleJson";
import {
  NODE_WIDTH,
  ProgramNodeTag,
  buildProgramBuffer,
  decodeProgram,
  encodeProgram,
  isProgramBinary,
  readProgramBuffer,
} from "../../binary/programBinary";

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

/** Re-serialize a compiled program through the runtime, as the player would. */
function storyToJson(compiled: unknown): string {
  const story = new RuntimeStory(compiled as never);
  const writer = new SimpleJson.Writer();
  story.ToJson(writer);
  return JSON.stringify(writer.toObject());
}

/** Exercises constants, defines, diverts, choices, functions and interpolation. */
function corpus(): string {
  const L: string[] = [];
  L.push("title: Binary Round Trip");
  L.push("author: Anonymous");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("const LIMIT = 3");
  L.push("const LABEL = \"chapter\"");
  L.push("store trust = 0");
  L.push("store ratio = 0.5");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action in room ${s} with {trust} and {LIMIT}.`);
    L.push("hero:");
    L.push(`  Dialogue line for ${s} — {LABEL}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: Trusted in ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in ${s}.`);
    L.push("end");
    L.push("& trust = bonus(trust)");
    L.push(`-> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

describe("binary program format round-trip", () => {
  it("decodes back to a byte-identical program", () => {
    const compiled = compileToJson(corpus());
    expect(compiled, "corpus must compile").toBeTruthy();
    const bytes = encodeProgram(compiled);
    expect(isProgramBinary(bytes)).toBe(true);
    const decoded = decodeProgram(bytes);
    // Key ORDER matters: the program is compared as serialized text elsewhere
    // in the pipeline, so an order-insensitive match would hide real drift.
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(compiled));
  });

  it("produces a runtime story that re-serializes identically", () => {
    const compiled = compileToJson(corpus());
    const decoded = decodeProgram(encodeProgram(compiled));
    expect(storyToJson(decoded)).toBe(storyToJson(compiled));
  });

  it("round-trips the JSON value types the format has to carry", () => {
    const value = {
      nested: { deep: [1, -1, 0, 2.5, -0.125, true, false, null, ""] },
      "": "empty key",
      unicode: "héllo ✨ 𝄞",
      big: 1234567,
      float: 1e-7,
      emptyArray: [],
      emptyObject: {},
      repeated: ["ev", "ev", "ev", "/ev", "/ev"],
    };
    expect(JSON.stringify(decodeProgram(encodeProgram(value)))).toBe(
      JSON.stringify(value),
    );
  });

  it("interns repeated strings instead of storing them per occurrence", () => {
    // The size win comes from ink bytecode being mostly repeated short
    // tokens; if this regresses, the format is not paying for itself.
    const repeated = { a: Array.from({ length: 500 }, () => "ev") };
    const buffer = buildProgramBuffer(repeated);
    expect(buffer.strings).toEqual(["a", "ev"]);
  });

  it("stores a relocatable subtree SIZE, not an end index", () => {
    // The property phase 2 depends on, and lezer's reason for storing a size:
    // it is intrinsic to the node, so a subtree can be copied to a different
    // position without rewriting anything inside it. An end index would encode
    // where the node happens to sit.
    const buffer = buildProgramBuffer({ first: [1, 2, 3], second: 9 });
    const { nodes } = buffer;
    expect(nodes[0]).toBe(ProgramNodeTag.Object);
    // Root spans the whole buffer, expressed as a count of records.
    expect(nodes[2]).toBe(nodes.length / NODE_WIDTH);

    const firstMember = 1;
    expect(nodes[firstMember * NODE_WIDTH]).toBe(ProgramNodeTag.Member);
    // Member + Array + 3 numbers = 5 records.
    expect(nodes[firstMember * NODE_WIDTH + 2]).toBe(5);

    // Hopping a node's size lands on the next sibling.
    const secondMember = firstMember + nodes[firstMember * NODE_WIDTH + 2]!;
    expect(nodes[secondMember * NODE_WIDTH]).toBe(ProgramNodeTag.Member);
    expect(secondMember).toBe(firstMember + 1 + 1 + 3);

    // A leaf occupies exactly one record.
    expect(nodes[(secondMember + 1) * NODE_WIDTH + 2]).toBe(1);
  });

  it("exposes node and double sections as views, not copies", () => {
    // Zero-copy is the reason for the layout; if these ever became copies the
    // SharedArrayBuffer phase would silently gain a full deserialization.
    const bytes = encodeProgram({ n: 1.5, s: "x" });
    const buffer = readProgramBuffer(bytes);
    expect(buffer.nodes.buffer).toBe(bytes.buffer);
    expect(buffer.numbers.buffer).toBe(bytes.buffer);
  });

  it("reads a message sitting at an unaligned offset in a larger buffer", () => {
    // Sections are aligned relative to the START of the message, so a framed
    // or sliced payload lands the Float64Array/Uint16Array views on odd byte
    // offsets and their constructors throw a bare RangeError. A transferred
    // buffer is offset 0, so this is the case that would crash rather than
    // the case that is common.
    const value = { a: [1.5, "x"], b: 2 };
    const bytes = encodeProgram(value);
    for (const offset of [1, 2, 3, 4, 5, 6, 7]) {
      const framed = new Uint8Array(offset + bytes.length);
      framed.set(bytes, offset);
      const view = framed.subarray(offset);
      expect(view.byteOffset, "test must actually be unaligned").toBe(offset);
      expect(JSON.stringify(decodeProgram(view)), `offset ${offset}`).toBe(
        JSON.stringify(value),
      );
    }
  });

  it("rejects bytes that are not this format", () => {
    expect(() => decodeProgram(new Uint8Array([1, 2, 3, 4]))).toThrow(
      /Not a sparkdown binary program/,
    );
    expect(isProgramBinary(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });
});
