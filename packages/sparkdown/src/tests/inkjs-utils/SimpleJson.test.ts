// Ported from inkjs `src/tests/specs/inkjs/utils/SimpleJson.spec.ts`.
//
// SimpleJson is the bespoke streaming JSON writer/reader that powers
// `Story.state.ToJson()` and `state.LoadJson()`. Sparkdown's runtime
// uses it unmodified — these tests verify the writer's bracket-balance
// rules, integer/float distinction (and the `"3.0f"` marker convention
// for whole-number floats), Infinity/NaN coercion, and the reader's
// behavior on well-formed vs malformed JSON. Originally written against
// Jest; ported to vitest with `import { describe, expect, it, beforeEach }`
// instead of relying on Jest globals.

import { beforeEach, describe, expect, it } from "vitest";
import { SimpleJson } from "../../inkjs/engine/SimpleJson";

describe("SimpleJson.Writer", () => {
  let writer: SimpleJson.Writer;

  beforeEach(() => {
    writer = new SimpleJson.Writer();
  });

  it("writes a proper inner hierarchy", () => {
    writer.WriteObjectStart();
    writer.WriteProperty("callstackThreads", () => {
      writer.WriteObjectStart();
      {
        writer.WritePropertyStart("callstack");
        {
          writer.WriteArrayStart();
          {
            writer.WriteObjectStart();
            {
              writer.WriteProperty("cPath", "path.to.component");
              writer.WriteIntProperty("idx", 2);
              writer.WriteProperty("exp", "expression");
              writer.WriteIntProperty("type", 3);
            }
            writer.WriteObjectEnd();
            writer.WriteNull();
          }
          writer.WriteArrayEnd();
        }
        writer.WritePropertyEnd();

        writer.WriteIntProperty("threadIndex", 0);
        writer.WriteProperty("previousContentObject", "path.to.object");
      }
      writer.WriteObjectEnd();
    });

    writer.WriteIntProperty("inkSaveVersion", 8);
    writer.WriteObjectEnd();

    expect(writer.toString()).toEqual(
      '{"callstackThreads":{"callstack":[{"cPath":"path.to.component","idx":2,"exp":"expression","type":3},null],"threadIndex":0,"previousContentObject":"path.to.object"},"inkSaveVersion":8}',
    );
  });

  it("writes a proper inner string", () => {
    writer.WriteObjectStart();
    {
      writer.WritePropertyNameStart();
      writer.WritePropertyNameInner("prop");
      writer.WritePropertyNameInner("erty");
      writer.WritePropertyNameEnd();

      writer.WriteStringStart();
      writer.WriteStringInner("^");
      writer.WriteStringInner("Hello World.");
      writer.WriteStringEnd();
      writer.WritePropertyEnd();

      writer.WritePropertyStart("key");
      writer.WriteArrayStart();
      {
        writer.WriteStringStart();
        writer.WriteStringInner("^");
        writer.WriteStringInner("Hello World.");
        writer.WriteStringEnd();
      }
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();
    }
    writer.WriteObjectEnd();

    expect(writer.toString()).toEqual(
      '{"property":"^Hello World.","key":["^Hello World."]}',
    );
  });

  it("handles nested arrays", () => {
    writer.WriteArrayStart();
    {
      writer.WriteArrayStart();
      {
        writer.WriteArrayStart();
        {
          writer.WriteArrayStart();
          writer.WriteNull();
          writer.WriteArrayEnd();
        }
        writer.WriteArrayEnd();
      }
      writer.WriteArrayEnd();
    }
    writer.WriteArrayEnd();

    expect(writer.toString()).toEqual("[[[[null]]]]");
  });

  it("throws with unbalanced calls", () => {
    expect(() => {
      writer.WriteObjectStart();
      writer.WritePropertyEnd();
    }).toThrow();

    expect(() => {
      writer.WriteStringStart();
      writer.WriteArrayStart();
      writer.WriteStringEnd();
    }).toThrow();
  });

  describe("when writing integers", () => {
    it("creates the proper object hierarchy", () => {
      writer.WriteObjectStart();
      writer.WriteIntProperty("property", 3);
      writer.WriteObjectEnd();

      expect(writer.toString()).toEqual('{"property":3}');
    });

    it("creates the proper array hierarchy", () => {
      writer.WriteArrayStart();
      writer.WriteInt(3);
      writer.WriteArrayEnd();

      expect(writer.toString()).toEqual("[3]");
    });

    it("converts floats into integer", () => {
      writer.WriteArrayStart();
      {
        writer.WriteObjectStart();
        writer.WriteIntProperty("property", 3.9);
        writer.WriteObjectEnd();

        writer.WriteArrayStart();
        writer.WriteInt(3.1);
        writer.WriteInt(4.0);
        writer.WriteArrayEnd();
      }
      writer.WriteArrayEnd();

      expect(writer.toString()).toEqual('[{"property":3},[3,4]]');
    });
  });

  describe("when writing floats", () => {
    it("creates the proper object hierarchy", () => {
      writer.WriteObjectStart();
      writer.WriteFloatProperty("property", 3.4);
      writer.WriteObjectEnd();

      expect(writer.toString()).toEqual('{"property":3.4}');
    });

    it("creates the proper array hierarchy", () => {
      writer.WriteArrayStart();
      writer.WriteFloat(36.1456);
      writer.WriteArrayEnd();

      expect(writer.toString()).toEqual("[36.1456]");
    });

    it("emits whole-number floats with the `\"N.0f\"` marker", () => {
      // Diverges intentionally from upstream inkjs (which emits `[3,4]`
      // for `WriteFloat(3); WriteFloat(4)`). Sparkdown's vendored
      // SimpleJson uses the `"N.0f"` string marker so the loader can
      // recover whole-number floats as FloatValue rather than IntValue
      // — without this, mixed-type ops like `7 / 3.0` would degrade
      // to integer division after a save/load round-trip. See the
      // comment on `WriteFloat` in `engine/SimpleJson.ts`.
      writer.WriteArrayStart();
      writer.WriteFloat(3);
      writer.WriteFloat(4);
      writer.WriteArrayEnd();

      expect(writer.toString()).toEqual('["3.0f","4.0f"]');
    });

    it("converts infinity and NaN", () => {
      writer.WriteArrayStart();
      writer.WriteFloat(Infinity);
      writer.WriteFloat(-Infinity);
      writer.WriteFloat(NaN);
      writer.WriteArrayEnd();

      expect(writer.toString()).toEqual("[3.4e+38,-3.4e+38,0]");
    });
  });
});

describe("SimpleJson.Reader", () => {
  it("parses a JSON object string", () => {
    // Whole-number floats in JSON (`3.0`) round-trip as the literal
    // string `"3.0f"` so the writer can later re-serialize them as
    // floats rather than integers. See `WriteFloat` for the f-marker
    // convention.
    const jsonString = '{"key":"value", "array": [1, 2, null, 3.0, false]}';
    const object = {
      array: [1, 2, null, "3.0f", false],
      key: "value",
    };

    const reader = new SimpleJson.Reader(jsonString);

    expect(reader.ToDictionary()).toEqual(object);
    expect(SimpleJson.TextToDictionary(jsonString)).toEqual(object);
  });

  it("parses a JSON array string", () => {
    const jsonString = "[1, 2, null, 3.0, false]";
    const object = [1, 2, null, "3.0f", false];

    const reader = new SimpleJson.Reader(jsonString);

    expect(reader.ToArray()).toEqual(object);
    expect(SimpleJson.TextToArray(jsonString)).toEqual(object);
  });

  it("throws if the json is malformed", () => {
    const jsonString = '{key: "value"]';

    expect(() => {
      const reader = new SimpleJson.Reader(jsonString);
      reader.ToDictionary();
    }).toThrow();

    expect(() => {
      SimpleJson.TextToDictionary(jsonString);
    }).toThrow();
  });
});
