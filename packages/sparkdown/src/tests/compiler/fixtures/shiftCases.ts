import { coupledScreenplay, cumulativeScreenplay } from "./coupledScreenplay";

export type Project = Record<string, string>;

export interface ShiftCase {
  name: string;
  project: Project;
}

export const lines = (...l: string[]) => [...l, ""].join("\n");

const copiedIntoTwoFiles = (main: string[], body: (name: string) => string): Project => ({
  main: lines(...main, "scene start", "end"),
  pre: body("pf"),
  shared: body("sf"),
});

export const SHIFT_CASES: ShiftCase[] = [
  { name: "the single-edit oracle's screenplay", project: { main: coupledScreenplay() } },
  { name: "the cumulative oracle's screenplay", project: { main: cumulativeScreenplay() } },
  {
    name: "names the rename pass canonicalizes",
    project: {
      main: lines(
        "store a = { add = function(self, n) return self end }",
        "store r = 0",
        "",
        "scene start",
        "HERO: A ..",
        ".. B > C",
        "& r = a:add(1):add(2)",
        "end",
        "",
        "function f()",
        "  for i = 1, 2 do",
        "    r = r + i",
        "  end",
        "end",
      ),
    },
  },
  {
    name: "#845: a continuation group below a scene",
    project: { main: lines("scene start", "  Short.", "-> two", "end", "", "scene two", "HERO: A ..", "B > C", "end") },
  },
  {
    name: "#848: method-call temps in several scripts",
    project: {
      main: lines(
        "store a = { add = function(self, n) return self end }",
        "store r = 0",
        "",
        "scene start",
        "  Opening line.",
        "& r = a:add(3):add(4)",
        "end",
      ),
      chapter: lines("scene chapter_one", "  Chapter line.", "-> shared_one", "end"),
      pre: lines("scene pre_one", "  Before the shared script.", "end"),
      shared: lines("scene shared_one", "& r = a:add(1):add(2)", "end"),
    },
  },
  {
    name: "#848: a layout binding",
    project: {
      main: lines(
        "store a = 1",
        "",
        "scene start",
        "  First line.",
        "end",
        "",
        "layout la with",
        '  text "{a}"',
        "end",
      ),
    },
  },
  {
    name: "#870: anonymous functions at the same offset of two files",
    project: {
      main: lines("store x = 0", "scene start", "  & x = fa_f() + fb_f()", "end"),
      fa: lines("store fa_f = function() return 1 end"),
      fb: lines("store fb_f = function() return 2 end"),
    },
  },
  {
    name: "#870: define methods at the same offset of two files",
    project: {
      main: lines("store x = 0", "scene start", "  & x = ca:get() + cb:get()", "end"),
      fa: lines("define ca with", "  function get()", "    return 1", "  end", "end"),
      fb: lines("define cb with", "  function get()", "    return 2", "  end", "end"),
    },
  },
  {
    name: "#870: method-call temps at the same offset of two files",
    project: copiedIntoTwoFiles(
      ["store a = { add = function(self, n) return self end }", "store r = 0"],
      (name) => lines(`function ${name}()`, "  r = a:add(1):add(2)", "end"),
    ),
  },
  {
    name: "#870: numeric for loops at the same offset of two files",
    project: copiedIntoTwoFiles(["store r = 0"], (name) =>
      lines(`function ${name}()`, "  for i = 1, 2 do", "    r = r + i", "  end", "end"),
    ),
  },
  {
    name: "#870: while, repeat and generic for loops at the same offset of two files",
    project: copiedIntoTwoFiles(["store r = 0"], (name) =>
      lines(
        `function ${name}()`,
        "  while r < 1 do",
        "    r = r + 1",
        "  end",
        "  repeat",
        "    r = r + 1",
        "  until r > 3",
        "  for _, v in ipairs({ 1, 2 }) do",
        "    r = r + v",
        "  end",
        "end",
      ),
    ),
  },
  {
    name: "#912: compound and multi-target assignment temps",
    project: {
      main: lines(
        "store t = { a = 0, b = 0 }",
        "",
        "scene start",
        "  Line 0.",
        "end",
        "",
        "function f()",
        "  t.a += 1",
        "  local x",
        "  x, t.b = 1, 2",
        "end",
      ),
    },
  },
];
