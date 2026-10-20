// The complete message/location inventory of the two fixed integer corpus
// inputs, read by readLuauUnits at #1309's base 40abe4554 and read again
// when I-1322 made the reading recover as Luau does at a closer of a bracket
// it gave up on (`integers.luau`'s `)` after an `i`). Lines and columns
// are zero-based document positions. Integer suffixes cause recovery errors
// as well as errors at `i`; any added, removed, or changed error must fail the
// intentional exception rather than hiding an unrelated syntax regression.
// The recorded error limit is retained; the suffix-neutralized full-AST
// control separately covers syntax beyond that limit.
import type { DetailedDiagnostic } from "../luau-conformance/diagnosticTestHarness";
export const UNSUPPORTED_INTEGER_SYNTAX_ERRORS_1309: Record<string, readonly string[]> = {
  "conformance/integers_regspill.luau": [
    "86:53-86:54 Expected ')' (to close '(' at column 49), got 'i'",
    "116:43-116:44 Expected ')' (to close '(' at column 38), got 'i'",
    "117:44-117:45 Expected ')' (to close '(' at column 38), got 'i'",
    "118:44-118:45 Expected ')' (to close '(' at column 38), got 'i'",
    "119:44-119:45 Expected ')' (to close '(' at column 38), got 'i'",
    "204:54-204:55 Expected ')' (to close '(' at column 48), got 'i'",
    "205:55-205:56 Expected ')' (to close '(' at column 49), got 'i'",
    "207:42-207:43 Expected ')' (to close '(' at column 37), got 'i'",
    "232:40-232:41 Expected ')' (to close '(' at column 35), got 'i'",
    "237:43-237:44 Expected ')' (to close '(' at column 38), got 'i'",
    "238:43-238:44 Expected ')' (to close '(' at column 38), got 'i'",
    "239:44-239:45 Expected ')' (to close '(' at column 39), got 'i'",
    "240:44-240:45 Expected ')' (to close '(' at column 39), got 'i'",
    "241:44-241:45 Expected ')' (to close '(' at column 39), got 'i'",
    "262:56-262:57 Expected ')' (to close '(' at column 50), got 'i'",
    "263:56-263:57 Expected ')' (to close '(' at column 50), got 'i'",
    "265:42-265:43 Expected ')' (to close '(' at column 37), got 'i'",
    "285:38-285:39 Incomplete statement: expected assignment or a function call",
    "286:38-286:39 Incomplete statement: expected assignment or a function call",
    "287:38-287:39 Incomplete statement: expected assignment or a function call",
    "288:38-288:39 Incomplete statement: expected assignment or a function call",
    "289:39-289:40 Incomplete statement: expected assignment or a function call"
  ],
  "conformance/integers.luau": [
    "12:15-12:16 Expected ')' (to close '(' at column 12), got 'i'",
    "15:10-15:11 Expected ')' (to close '(' at column 7), got 'i'",
    "15:12-15:14 Expected identifier when parsing expression, got '=='",
    "15:30-15:31 Expected ')' (to close '(' at column 27), got 'i'",
    "15:32-15:34 Expected identifier when parsing expression, got '23'",
    "15:34-15:35 Incomplete statement: expected assignment or a function call",
    "15:35-15:36 Expected identifier when parsing expression, got ')'",
    "15:36-15:37 Expected identifier when parsing expression, got ')'",
    "16:12-16:13 Expected ')' (to close '(' at column 7), got 'i'",
    "16:14-16:16 Expected identifier when parsing expression, got '=='",
    "16:17-16:20 Expected identifier when parsing expression, got '255'",
    "16:20-16:21 Incomplete statement: expected assignment or a function call",
    "16:21-16:22 Expected identifier when parsing expression, got ')'",
    "17:12-17:13 Expected ')' (to close '(' at column 7), got 'i'",
    "17:14-17:16 Expected identifier when parsing expression, got '=='",
    "17:17-17:21 Expected identifier when parsing expression, got '1000'",
    "17:21-17:22 Incomplete statement: expected assignment or a function call",
    "17:22-17:23 Expected identifier when parsing expression, got ')'",
    "18:13-18:14 Expected ')' (to close '(' at column 7), got 'i'",
    "18:15-18:17 Expected identifier when parsing expression, got '=='",
    "18:18-18:23 Expected identifier when parsing expression, got '43947'",
    "18:23-18:24 Incomplete statement: expected assignment or a function call",
    "18:24-18:25 Expected identifier when parsing expression, got ')'",
    "19:18-19:19 Expected ')' (to close '(' at column 7), got 'i'",
    "19:20-19:22 Expected identifier when parsing expression, got '=='",
    "19:23-19:26 Expected identifier when parsing expression, got '136'",
    "19:26-19:27 Incomplete statement: expected assignment or a function call",
    "19:27-19:28 Expected identifier when parsing expression, got ')'",
    "20:15-20:16 Expected ')' (to close '(' at column 7), got 'i'",
    "20:17-20:19 Expected identifier when parsing expression, got '=='",
    "20:20-20:28 Expected identifier when parsing expression, got '11259375'",
    "20:28-20:29 Incomplete statement: expected assignment or a function call",
    "20:29-20:30 Expected identifier when parsing expression, got ')'",
    "21:15-21:16 Expected ')' (to close '(' at column 7), got 'i'",
    "21:17-21:19 Expected identifier when parsing expression, got '=='",
    "21:20-21:28 Expected identifier when parsing expression, got '16702650'",
    "21:28-21:29 Incomplete statement: expected assignment or a function call",
    "21:29-21:30 Expected identifier when parsing expression, got ')'",
    "22:26-22:27 Expected ')' (to close '(' at column 7), got 'i'",
    "22:28-22:30 Expected identifier when parsing expression, got '=='",
    "22:31-22:49 Expected identifier when parsing expression, got '0x8000000000000000'",
    "22:49-22:50 Incomplete statement: expected assignment or a function call",
    "22:50-22:51 Expected identifier when parsing expression, got ')'",
    "23:26-23:27 Expected ')' (to close '(' at column 7), got 'i'",
    "23:28-23:30 Expected identifier when parsing expression, got '=='",
    "23:31-23:32 Expected identifier when parsing expression, got '1'",
    "23:32-23:33 Incomplete statement: expected assignment or a function call",
    "23:33-23:34 Expected identifier when parsing expression, got ')'",
    "26:9-26:10 Expected ')' (to close '(' at column 7), got 'i'",
    "26:10-26:12 Expected identifier when parsing expression, got '=='",
    "26:12-26:14 Expected identifier when parsing expression, got '76'",
    "26:14-26:15 Incomplete statement: expected assignment or a function call",
    "26:15-26:16 Expected identifier when parsing expression, got ')'",
    "27:9-27:10 Expected ')' (to close '(' at column 7), got 'i'",
    "27:10-27:12 Expected identifier when parsing expression, got '~='",
    "27:12-27:14 Expected identifier when parsing expression, got '32'",
    "27:14-27:15 Incomplete statement: expected assignment or a function call",
    "27:15-27:16 Expected identifier when parsing expression, got ')'",
    "28:18-28:19 Expected ')' (to close '(' at column 16), got 'i'",
    "28:21-28:23 Expected identifier when parsing expression, got '76'",
    "28:23-28:24 Incomplete statement: expected assignment or a function call",
    "28:24-28:25 Expected identifier when parsing expression, got ')'",
    "28:25-28:26 Expected identifier when parsing expression, got ')'",
    "29:22-29:23 Expected ')' (to close '(' at column 20), got 'i'",
    "29:25-29:27 Expected identifier when parsing expression, got '32'",
    "29:27-29:28 Incomplete statement: expected assignment or a function call",
    "29:28-29:29 Expected identifier when parsing expression, got ')'",
    "29:29-29:30 Expected identifier when parsing expression, got ')'",
    "30:22-30:23 Expected ')' (to close '(' at column 20), got 'i'",
    "30:25-30:27 Expected identifier when parsing expression, got '76'",
    "30:27-30:28 Expected identifier when parsing expression, got ')'",
    "30:28-30:29 Expected identifier when parsing expression, got ')'",
    "34:35-34:36 Expected ')' (to close '(' at column 7), got 'i'",
    "35:31-35:32 Expected ')' (to close '(' at column 7), got 'i'",
    "36:50-36:51 Expected ')' (to close '(' at column 7), got 'i'",
    "37:52-37:53 Expected ')' (to close '(' at column 7), got 'i'",
    "52:37-52:38 Expected ')' (to close '(' at column 7), got 'i'",
    "53:43-53:44 Expected ')' (to close '(' at column 7), got 'i'",
    "56:41-56:42 Expected ')' (to close '(' at column 7), got 'i'",
    "57:36-57:37 Expected ')' (to close '(' at column 7), got 'i'",
    "58:37-58:38 Expected ')' (to close '(' at column 7), got 'i'",
    "59:41-59:42 Expected ')' (to close '(' at column 7), got 'i'",
    "60:41-60:42 Expected ')' (to close '(' at column 7), got 'i'",
    "61:57-61:58 Expected ')' (to close '(' at column 7), got 'i'",
    "62:54-62:55 Expected ')' (to close '(' at column 7), got 'i'",
    "63:63-63:64 Expected ')' (to close '(' at column 7), got 'i'",
    "64:65-64:66 Expected ')' (to close '(' at column 7), got 'i'",
    "65:41-65:42 Expected ')' (to close '(' at column 7), got 'i'",
    "66:45-66:46 Expected ')' (to close '(' at column 7), got 'i'",
    "72:53-72:54 Expected ')' (to close '(' at column 7), got 'i'",
    "73:59-73:60 Expected ')' (to close '(' at column 7), got 'i'",
    "74:55-74:56 Expected ')' (to close '(' at column 7), got 'i'",
    "75:70-75:71 Expected ')' (to close '(' at column 7), got 'i'",
    "76:84-76:85 Expected ')' (to close '(' at column 65), got 'i'",
    "76:87-76:88 Expected identifier when parsing expression, got '1'",
    "76:88-76:89 Incomplete statement: expected assignment or a function call",
    "76:89-76:90 Expected identifier when parsing expression, got ')'",
    "76:90-76:91 Expected identifier when parsing expression, got ')'",
    "77:55-77:56 Expected ')' (to close '(' at column 7), got 'i'",
    "78:56-78:57 Expected ')' (to close '(' at column 7), got 'i'",
    "78:56-78:57 Reached error limit (100)"
  ]
};

// The compiler scans the whole input. Only these known recovery diagnostics
// accompany the explicit unsupported literal errors in the pinned corpus:
// the errors of Luau's reading, every one of which the type checker reports
// (I-1322), at the tokens no unsupported literal error covers.
export const UNSUPPORTED_INTEGER_RECOVERY_DIAGNOSTICS_1309: Record<string, readonly Pick<DetailedDiagnostic, "message" | "range">[]> = {
  "conformance/integers_regspill.luau": [],
  "conformance/integers.luau": [{
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 15, character: 12 }, end: { line: 15, character: 14 } },
  }, {
    message: "Expected identifier when parsing expression, got ')'",
    range: { start: { line: 15, character: 36 }, end: { line: 15, character: 37 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 16, character: 14 }, end: { line: 16, character: 16 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 17, character: 14 }, end: { line: 17, character: 16 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 18, character: 15 }, end: { line: 18, character: 17 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 19, character: 20 }, end: { line: 19, character: 22 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 20, character: 17 }, end: { line: 20, character: 19 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 21, character: 17 }, end: { line: 21, character: 19 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 22, character: 28 }, end: { line: 22, character: 30 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 23, character: 28 }, end: { line: 23, character: 30 } },
  }, {
    message: "Expected identifier when parsing expression, got '=='",
    range: { start: { line: 26, character: 10 }, end: { line: 26, character: 12 } },
  }, {
    message: "Expected identifier when parsing expression, got '~='",
    range: { start: { line: 27, character: 10 }, end: { line: 27, character: 12 } },
  }, {
    message: "Expected identifier when parsing expression, got ')'",
    range: { start: { line: 28, character: 25 }, end: { line: 28, character: 26 } },
  }, {
    message: "Expected identifier when parsing expression, got ')'",
    range: { start: { line: 29, character: 29 }, end: { line: 29, character: 30 } },
  }, {
    message: "Expected identifier when parsing expression, got '76'",
    range: { start: { line: 30, character: 25 }, end: { line: 30, character: 27 } },
  }, {
    message: "Expected identifier when parsing expression, got ')'",
    range: { start: { line: 30, character: 27 }, end: { line: 30, character: 28 } },
  }, {
    message: "Expected identifier when parsing expression, got ')'",
    range: { start: { line: 30, character: 28 }, end: { line: 30, character: 29 } },
  }, {
    message: "Expected identifier when parsing expression, got ')'",
    range: { start: { line: 76, character: 90 }, end: { line: 76, character: 91 } },
  }],
};
