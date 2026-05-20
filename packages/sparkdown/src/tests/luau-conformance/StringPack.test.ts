// `string.pack` / `string.unpack` / `string.packsize` — binary
// packing via DataView. Output is encoded as a byte string (each
// char ∈ [0, 255]) so it round-trips with `string.byte` / `char`.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: string[] = [];
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("string.pack — integers", () => {
  test("packs a single byte", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("B", 42)
host_record(string.len(s))
host_record(string.byte(s, 1))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 42]);
  });

  test("packs little-endian uint32 by default", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("I4", 0x01020304)
host_record(string.byte(s, 1))
host_record(string.byte(s, 2))
host_record(string.byte(s, 3))
host_record(string.byte(s, 4))
end
`);
    expect(errors).toEqual([]);
    // Little-endian: least significant byte first.
    expect(recorded).toEqual([0x04, 0x03, 0x02, 0x01]);
  });

  test("big-endian via `>` prefix", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack(">I4", 0x01020304)
host_record(string.byte(s, 1))
host_record(string.byte(s, 4))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0x01, 0x04]);
  });

  test("signed byte handles negative", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("b", -1)
host_record(string.byte(s, 1))
end
`);
    expect(errors).toEqual([]);
    // -1 as int8 → 0xFF (255 unsigned).
    expect(recorded).toEqual([0xff]);
  });
});

describe("string.unpack — round-trip", () => {
  test("unpacks what pack wrote (uint16)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("H", 0xABCD)
local v, nextpos = string.unpack("H", s)
host_record(v)
host_record(nextpos)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0xabcd, 3]);
  });

  test("unpacks signed int with negative round-trip", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("i4", -42)
local v = string.unpack("i4", s)
host_record(v)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([-42]);
  });

  test("multiple values in one format", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("BHB", 1, 2, 3)
local a, b, c = string.unpack("BHB", s)
host_record(a)
host_record(b)
host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });
});

describe("string.pack — strings", () => {
  test("null-terminated `z` string", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("z", "hi")
host_record(string.len(s))
host_record(string.byte(s, 3))
local v = string.unpack("z", s)
host_record(v)
end
`);
    expect(errors).toEqual([]);
    // "hi" + null = 3 bytes; byte 3 is the null terminator.
    expect(recorded).toEqual([3, 0, "hi"]);
  });

  test("fixed-size `c4` string pads with zeros", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("c4", "hi")
host_record(string.len(s))
host_record(string.byte(s, 4))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([4, 0]);
  });

  test("length-prefixed `s1` (1-byte length)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("s1", "hello")
host_record(string.byte(s, 1))
local v = string.unpack("s1", s)
host_record(v)
end
`);
    expect(errors).toEqual([]);
    // length prefix = 5, then "hello".
    expect(recorded).toEqual([5, "hello"]);
  });
});

describe("string.pack — floats", () => {
  test("float64 round-trip", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("d", 3.14)
local v = string.unpack("d", s)
host_record(v)
host_record(string.len(s))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3.14, 8]);
  });

  test("float32 has reduced precision", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("f", 1.5)
local v = string.unpack("f", s)
host_record(v)
host_record(string.len(s))
end
`);
    expect(errors).toEqual([]);
    // 1.5 is exactly representable in float32 — should round-trip exact.
    expect(recorded).toEqual([1.5, 4]);
  });
});

describe("string.packsize", () => {
  test("computes fixed-size format length", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.packsize("BHI4d"))
end
`);
    expect(errors).toEqual([]);
    // 1 + 2 + 4 + 8 = 15.
    expect(recorded).toEqual([15]);
  });

  test("errors on variable-width specs", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.packsize("s"))
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("variable-length");
  });
});

describe("string.pack — error paths", () => {
  test("not enough args", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("BB", 1)
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("not enough");
  });

  test("unknown format char", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.pack("Q", 42)
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("unknown format");
  });
});
