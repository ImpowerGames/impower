// The programs of #1429's saves that another process writes
// (`programSaveWriter.ts --scenarios`) and `programSaveLayout.test.ts` and
// `programSaveHistory.test.ts` load: each the program the writer plays, the
// beats it plays before it saves, and the beats a save holds. The loading
// process compiles only the programs the tests derive from these, edited,
// and never compiles them again for the writer's run.

/** A function that displays a line, which a beat can stand inside. */
const SHOW = [
  "",
  "function show(v)",
  '  display("Shown " .. v)',
  "  return v",
  "end",
  "",
];

export interface SaveScenario {
  script: string;
  /** The beats the writer plays before it saves. */
  beats: number;
  /** The beats the save holds (`ProgramStory.saveHistory`); one where a
   *  test asserts a placement with a warning, which a save with an earlier
   *  beat placed exactly would not take (section 8, step 6). */
  saveHistory?: number;
  /** Takes a keyframe image of every this many beats, as a game that
   *  checkpoints with that `baseInterval` does. */
  keyframeEvery?: number;
}

export const SAVE_SCENARIOS: Record<string, SaveScenario> = {
  // A frame inside a statement's code, with an operand on the eval stack,
  // in a loop's body whose pass scope holds a variable a closure captured.
  inside: {
    script: [
      "store x = 0",
      "store keep = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  Before.",
      "  for i = 1, 2 do",
      "    & local v = i * 10",
      "    & keep = function() return v end",
      "    & x = x + 1 + show(v)",
      "  end",
      "  After {x} {keep()}.",
      "end",
      ...SHOW,
    ].join("\n"),
    beats: 2,
    saveHistory: 1,
  },
  // A statement that reads a constant, saved at its start.
  constant: {
    script: [
      "const K = 1",
      "store total = 0",
      "",
      "-> start",
      "",
      "scene start",
      "  First.",
      "  & total = total + K",
      "  Total {total}.",
      "end",
      "",
    ].join("\n"),
    beats: 1,
  },
  // A save inside a loop's second pass.
  pass: {
    script: [
      "store n = 0",
      "",
      "-> start",
      "",
      "scene start",
      "  Begin.",
      "  while n < 3 do",
      "    & n = n + 1",
      "    Pass {n} a.",
      "    Pass {n} b.",
      "  end",
      "  Done {n}.",
      "end",
      "",
    ].join("\n"),
    beats: 4,
    saveHistory: 1,
  },
  // Statements a later program wraps in a loop.
  wrap: {
    script: [
      "store k = 0",
      "",
      "-> start",
      "",
      "scene start",
      "  Intro.",
      "  W1.",
      "  W2.",
      "  W3.",
      "  W4.",
      "  Outro.",
      "end",
      "",
    ].join("\n"),
    beats: 2,
    saveHistory: 1,
  },
  // A call that is the last statement of a loop's body.
  last: {
    script: [
      "-> start",
      "",
      "scene start",
      "  for i = 1, 3 do",
      "    Line {i}.",
      "    & show(i)",
      "  end",
      "  Done.",
      "end",
      ...SHOW,
      "function quiet(v)",
      "  return v",
      "end",
      "",
    ].join("\n"),
    beats: 2,
    saveHistory: 1,
  },
  // A frame inside a variadic function's body.
  variadic: {
    script: [
      "-> start",
      "",
      "scene start",
      "  Before.",
      "  & vf(1, 2)",
      "  After.",
      "end",
      "",
      "function vf(...)",
      '  display("In vf")',
      '  display("Still in vf")',
      "  return 0",
      "end",
      "",
    ].join("\n"),
    beats: 2,
    saveHistory: 1,
  },
  // A closure defined in a loop and run after the loop ended.
  closure: {
    script: [
      "store fns = {}",
      "",
      "-> start",
      "",
      "scene start",
      "  for i = 1, 2 do",
      "    & fns[i] = function() return show(i) end",
      "  end",
      "  Ran.",
      "  & fns[2]()",
      "  After.",
      "end",
      ...SHOW,
    ].join("\n"),
    beats: 2,
  },
  // The heap of each beat: a table two globals refer to, written at each
  // beat; a table the keyframe wrote that is first written after it; a
  // table and a cell made after it; two closures that share the cell.
  heap: {
    script: [
      "store t = { n = 0 }",
      "store alias = nil",
      "store u = { v = 0 }",
      "store uAlias = nil",
      "store late = nil",
      "store inc = nil",
      "store get = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  & alias = t",
      "  & uAlias = u",
      "  Beat 1 {t.n}.",
      "  & t.n = t.n + 1",
      "  & alias = t",
      "  Beat 2 {t.n}.",
      "  & t.n = t.n + 1",
      "  & alias = t",
      "  & u.v = 5",
      "  & late = { w = 1 }",
      "  & local function make()",
      "  &   local c = 0",
      "  &   inc = function() c = c + 1 end",
      "  &   get = function() return c end",
      "  & end",
      "  & make()",
      "  & inc()",
      "  Beat 3 {t.n} {u.v} {late.w} {get()}.",
      "  & t.n = t.n + 1",
      "  & alias = t",
      "  & late.w = 2",
      "  & inc()",
      "  Beat 4 {t.n} {late.w} {get()}.",
      "  & t.n = t.n + 1",
      "  & alias = t",
      "  Beat 5 {t.n}.",
      "end",
      "",
    ].join("\n"),
    beats: 4,
  },
};

/** Thirty lines, saved after twenty-five beats with a keyframe image every
 *  seven, so that the beats a save holds span keyframes. */
SAVE_SCENARIOS["long"] = {
  script: [
    "-> start",
    "",
    "scene start",
    ...Array.from({ length: 30 }, (_, i) => `  Line ${i + 1}.`),
    "end",
    "",
  ].join("\n"),
  beats: 25,
  keyframeEvery: 7,
};

/** What the writer prints before each scenario's name and save. */
export const SCENARIO_MARKER = "SCENARIO:";
