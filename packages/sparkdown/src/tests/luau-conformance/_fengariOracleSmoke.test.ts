// Smoke test for the fengari oracle harness itself. If these fail
// it means our Lua-binding setup is wrong, not that our pattern
// engine is wrong. Real conformance tests are in StringPatterns.test.ts.

import { describe, expect, test } from "vitest";
import {
  fengariFind,
  fengariGmatch,
  fengariGsub,
  fengariMatch,
} from "./_fengariOracle";

describe("fengari oracle harness", () => {
  test("find returns [start, end] for a simple match", () => {
    expect(fengariFind("hello world", "world")).toEqual([7, 11]);
  });

  test("find returns null on no match", () => {
    expect(fengariFind("abc", "xyz")).toBeNull();
  });

  test("find returns [start, end, ...captures] when pattern has captures", () => {
    expect(fengariFind("2026-05-20", "(%d+)-(%d+)-(%d+)")).toEqual([
      1,
      10,
      "2026",
      "05",
      "20",
    ]);
  });

  test("match returns captures", () => {
    expect(fengariMatch("hello 42 world", "%d+")).toEqual(["42"]);
    expect(fengariMatch("2026-05-20", "(%d+)-(%d+)-(%d+)")).toEqual([
      "2026",
      "05",
      "20",
    ]);
  });

  test("gmatch yields each match", () => {
    expect(fengariGmatch("a b c d e", "%a")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  test("gmatch with captures yields each capture", () => {
    expect(
      fengariGmatch("from=here, to=there", "(%a+)=(%a+)"),
    ).toEqual(["from", "here", "to", "there"]);
  });

  test("gsub with string replacement", () => {
    expect(fengariGsub("hello world", "o", "0")).toEqual(["hell0 w0rld", 2]);
  });

  test("gsub with table replacement", () => {
    expect(
      fengariGsub("hi $name", "%$(%a+)", { name: "Anonymous" }),
    ).toEqual(["hi Anonymous", 1]);
  });

  test("gsub with max-n cap", () => {
    expect(fengariGsub("aaaaaa", "a", "X", 3)).toEqual(["XXXaaa", 3]);
  });
});
