// Ported from inkjs `src/tests/specs/inkjs/utils/TryGetResult.spec.ts`.
//
// `TryGetResult` is the small helper used throughout the runtime for
// safe map lookups + numeric parsing. Returns `{ result, exists }` so
// callers can distinguish "missing" from "present but falsy". Used by
// `JsonSerialisation`, `CallStack`, `ListDefinition`, `Container`, ...
// — pure unit tests against the helper itself, no Story / compile
// pipeline involvement.

import { describe, expect, it } from "vitest";
import {
  tryGetValueFromMap,
  tryParseFloat,
  tryParseInt,
} from "../../inkjs/engine/TryGetResult";

describe("TryGetResult", () => {
  describe("tryGetValueFromMap", () => {
    it("returns an empty result if the map is null", () => {
      const attempt = tryGetValueFromMap(null, "key", null);

      expect(attempt.result).toBeNull();
      expect(attempt.exists).toBe(false);
    });

    it("returns an empty result if the value is not in the map", () => {
      const map = new Map();
      map.set("otherKey", "value");

      const attempt = tryGetValueFromMap(map, "key", "");

      expect(attempt.result).toBe("");
      expect(attempt.exists).toBe(false);
    });

    it("returns a result if the value is in the map", () => {
      const map = new Map();
      map.set("key", "value");

      const attempt = tryGetValueFromMap(map, "key", "");

      expect(attempt.result).toBe("value");
      expect(attempt.exists).toBe(true);
    });

    it("returns a result if the falsy value is in the map", () => {
      // Distinguishing falsy values (0, "", false, null) from "missing"
      // is the whole point of the wrapper — `Map.get` returns `undefined`
      // for both cases, so the helper checks `Map.has` and threads the
      // distinction through `exists`.
      const map = new Map();
      map.set("key", 0);

      const attempt = tryGetValueFromMap(map, "key", -1);

      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(true);
    });
  });

  describe("tryParseFloat", () => {
    it("returns an empty result if the value is not a number", () => {
      let attempt = tryParseFloat("", 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);

      attempt = tryParseFloat("abc", 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);

      attempt = tryParseFloat({}, 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);

      attempt = tryParseFloat(false, 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);
    });

    it("returns a valid result if the value can be converted to a float", () => {
      let attempt = tryParseFloat("3", 0);
      expect(attempt.result).toBe(3);
      expect(attempt.exists).toBe(true);

      attempt = tryParseFloat("0003.756", 0);
      expect(attempt.result).toBe(3.756);
      expect(attempt.exists).toBe(true);

      attempt = tryParseFloat("3e+3", 0);
      expect(attempt.result).toBe(3000);
      expect(attempt.exists).toBe(true);

      attempt = tryParseFloat(4, 0);
      expect(attempt.result).toBe(4);
      expect(attempt.exists).toBe(true);
    });
  });

  describe("tryParseInt", () => {
    it("returns an empty result if the value is not a number", () => {
      let attempt = tryParseInt("", 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);

      attempt = tryParseInt("abc", 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);

      attempt = tryParseInt({}, 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);

      attempt = tryParseInt(false, 0);
      expect(attempt.result).toBe(0);
      expect(attempt.exists).toBe(false);
    });

    it("returns a valid result if the value can be converted to an integer", () => {
      let attempt = tryParseInt("3", 0);
      expect(attempt.result).toBe(3);
      expect(attempt.exists).toBe(true);

      attempt = tryParseInt("0003.756", 0);
      expect(attempt.result).toBe(3);
      expect(attempt.exists).toBe(true);

      attempt = tryParseInt("3e+3", 0);
      expect(attempt.result).toBe(3);
      expect(attempt.exists).toBe(true);

      attempt = tryParseInt(4.5, 0);
      expect(attempt.result).toBe(4);
      expect(attempt.exists).toBe(true);
    });
  });
});
