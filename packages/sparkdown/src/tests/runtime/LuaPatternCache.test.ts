import { describe, expect, test } from "vitest";
import {
  executeLuaPattern,
  LuaPatternError,
  luaPatternToJs,
} from "../../runtime/LuaPatterns";

describe("luaPatternToJs compiled-pattern cache", () => {
  test("compiling the same pattern twice returns the same compiled pattern", () => {
    expect(luaPatternToJs("(%a+)%s*")).toBe(luaPatternToJs("(%a+)%s*"));
  });

  test("a shared compiled pattern matches from each caller's own start", () => {
    const compiled = luaPatternToJs("%d+");
    const first = executeLuaPattern(compiled, "a1 22 333", 0);
    const second = executeLuaPattern(luaPatternToJs("%d+"), "xx 4444", 0);
    const third = executeLuaPattern(compiled, "a1 22 333", first!.index + first!.length);
    expect([first?.index, second?.index, third?.index]).toEqual([1, 3, 3]);
    expect(third?.length).toBe(2);
  });

  test("the cache stays bounded and evicts its oldest pattern", () => {
    const oldest = luaPatternToJs("cache-eviction-oldest");
    for (let i = 0; i < 1000; i++) luaPatternToJs(`cache-eviction-${i}`);
    expect(luaPatternToJs("cache-eviction-oldest")).not.toBe(oldest);
  });

  test("an invalid pattern raises on every compile", () => {
    expect(() => luaPatternToJs("(%a")).toThrow(LuaPatternError);
    expect(() => luaPatternToJs("(%a")).toThrow(LuaPatternError);
  });
});
