// The text a durable save's fingerprint hashes is read from the parse
// (`fingerprintSource`, I-1112): every comment the grammar defines is left
// out of it, and the text of every string it defines is kept as written.
// The kinds are the grammar's own: every node the parser builds, a rule's or
// a capture's, whose TextMate scope is a comment or a string (a tag, scoped
// as both a comment and a tag, is text the program carries). Each has a
// sample below in which the grammar reads it, so a kind the grammar adds
// fails the first test until it has one.

import { describe, expect, test } from "vitest";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { normalizeSource } from "../../compiler/utils/fingerprintSource";

const kindsOf = (scope: "comment" | "string"): string[] =>
  createSparkdownParser()
    .grammar.nodes.filter((node) => {
      const name = node.props["name"];
      const scopes = typeof name === "string" ? name.split(" ") : [];
      const tag = scopes.some((s) => s.startsWith("entity.tag."));
      return scope === "string"
        ? tag || Boolean(scopes[0]?.startsWith("string."))
        : !tag && Boolean(scopes[0]?.startsWith("comment."));
    })
    .map((node) => node.typeId);

// Kinds no script reads: rules nothing reaches (`grammarReachability.test.ts`)
// and rules no sample or fixture of the repository reaches through the
// patterns that include them. A kind leaves this list when a sample reads it.
const UNREAD = [
  "AssignedQuotedEventAttribute",
  "AssignedQuotedStyleAttribute",
  "LuauCallableValueTrailingBlockComment",
  "LuauStylePropertyValue",
  "LuauUIAttributeValue",
  "LuauUIContentText",
  "SparkdownExplicitTag",
  "SparkdownExplicitTag_c2",
  "SparkdownExplicitTags",
  "StringLiteral",
];

// A script holding a comment, and the same script without it.
const COMMENTS: [string, string][] = [
  ["& x = 1 -- a note", "& x = 1"],
  ["& y = --[[ a block ]] 2", "& y = 2"],
  ["& z = 3 --- a doc note", "& z = 3"],
  ["// a whole line\nHello there.", "Hello there."],
  ["Hello there. // a note", "Hello there."],
  ["Hello *there*. // a note", "Hello *there*."],
  [
    "layout main with\n  if ok then // a note\n  end\nend",
    "layout main with\n  if ok then\n  end\nend",
  ],
  [
    "style card with\n  color = red // a note\nend",
    "style card with\n  color = red\nend",
  ],
  [
    'style card with\n  &[data-label="x"] {\n    color = red // a note\n  }\nend',
    'style card with\n  &[data-label="x"] {\n    color = red\n  }\nend',
  ],
  [
    "layout main with\n  row {\n    // a slash comment\n    text\n  }\nend",
    "layout main with\n  row {\n    text\n  }\nend",
  ],
  // The grammar reads a shebang's text after its `#!` as the comment.
  ["#!/usr/bin/env luau\n& x = 1", "#!/usr/bin/env other\n& x = 1"],
  ["& local x = 1 --[[c]] print(x)", "& local x = 1 print(x)"],
  // Its closing brackets stand outside the comment where a token follows
  // them, as the grammar reads it in a statement.
  ["& local x = 1 --[[a\n]]print(x)", "& local x = 1 --[[b\n]]print(x)"],
  ["& local x: number --[[c]] = 1", "& local x: number = 1"],
  [
    "function f(): number --[[a\n  b]]print(1)\nend",
    "function f(): number print(1)\nend",
  ],
];

// A script holding a string, and the same script with the spacing inside the
// string changed, or for a string that holds no whitespace, a character.
const STRINGS: [string, string][] = [
  ['& s = "a  b"', '& s = "a b"'],
  ["& s = 'a  b'", "& s = 'a b'"],
  ["& s = [[a  b]]", "& s = [[a b]]"],
  ["& s = `a {x}  b`", "& s = `a {x} b`"],
  ["& s = @/a  b/", "& s = @/a b/"],
  ["Spaced  words.", "Spaced words."],
  ["HERO: Hi  there.", "HERO: Hi there."],
  ["HERO:\n  Hello  there.", "HERO:\n  Hello there."],
  ["* Choice  one", "* Choice one"],
  ["# tag  one", "# tag one"],
  ["Line #tag  x", "Line #tag x"],
  [
    "A .. queue|red # red  x|white .. sequence.",
    "A .. queue|red # red x|white .. sequence.",
  ],
  ["^: A  title", "^: A title"],
  ["^:\n  A  title", "^:\n  A title"],
  ["$: A  heading", "$: A heading"],
  ["$:\n  A  heading", "$:\n  A heading"],
  ["%: CUT  TO", "%: CUT TO"],
  ["%:\n  CUT  TO", "%:\n  CUT TO"],
  ["@ note: A  write", "@ note: A write"],
  ["@ note:\n  A  write", "@ note:\n  A write"],
  ['run "other  one.sd"', 'run "other one.sd"'],
  ["run other  one", "run other one"],
  ["---\ntitle: A  B\n---", "---\ntitle: A B\n---"],
  [
    "style card with\n  color = #ff0000\nend",
    "style card with\n  color = #ff0001\nend",
  ],
  [
    "style card with\n  color = rgb(1, 2,  3)\nend",
    "style card with\n  color = rgb(1, 2, 3)\nend",
  ],
  [
    "style card with\n  color = hsl(1, 2%,  3%)\nend",
    "style card with\n  color = hsl(1, 2%, 3%)\nend",
  ],
  [
    'style card with\n  name = "a  b"\nend',
    'style card with\n  name = "a b"\nend',
  ],
  [
    'style card with\n  quip = "a {x}  b"\nend',
    'style card with\n  quip = "a {x} b"\nend',
  ],
  [
    'style card with\n  "quoted  key" = 1\nend',
    'style card with\n  "quoted key" = 1\nend',
  ],
  [
    "style card with\n  font = serif  sans\nend",
    "style card with\n  font = serif sans\nend",
  ],
  [
    "style card with\n  shadow = calc(a  b)\nend",
    "style card with\n  shadow = calc(a b)\nend",
  ],
  [
    "style card with\n  label = some  words -- note\nend",
    "style card with\n  label = some words -- note\nend",
  ],
  [
    "style card with\n  > #image^=raffles_a {\n  }\nend",
    "style card with\n  > #image^=raffles_b {\n  }\nend",
  ],
  [
    'style card with\n  &[data-label="x  y"] {\n  }\nend',
    'style card with\n  &[data-label="x y"] {\n  }\nend',
  ],
  [
    'layout main with\n  button primary "Use  it" @click=x\nend',
    'layout main with\n  button primary "Use it" @click=x\nend',
  ],
  [
    'layout main with\n  text "a {x}  b" #class=big\nend',
    'layout main with\n  text "a {x} b" #class=big\nend',
  ],
  [
    "layout main with\n  text 'a  b'\nend",
    "layout main with\n  text 'a b'\nend",
  ],
  [
    'layout main with\n  text "<color=a  b>Hi</color>"\nend',
    'layout main with\n  text "<color=a b>Hi</color>"\nend',
  ],
  [
    'layout main with\n  text "<shout=a  b>Hi</shout>"\nend',
    'layout main with\n  text "<shout=a b>Hi</shout>"\nend',
  ],
  [
    'layout main with\n  text #width="1  2"\nend',
    'layout main with\n  text #width="1 2"\nend',
  ],
  [
    'layout main with\n  if ok then\n    text "a  b"\n  end\nend',
    'layout main with\n  if ok then\n    text "a b"\n  end\nend',
  ],
  [
    'style card with\n  background-image = url("data:a  b")\nend',
    'style card with\n  background-image = url("data:a b")\nend',
  ],
];

// Two scripts that differ only in spacing that is not text: the spacing of
// logic, indentation, the space at a line's end, an interpolation's Luau.
const SAME_SPACING: [string, string][] = [
  ["& x  =  1 +   2", "& x=1+2"],
  ["HERO:\n  (softly)\n  Hi.", "HERO:\n      (softly)\n    Hi."],
  ["Hello there.   ", "Hello there."],
  ['& s = "a {x  +  1} b"', '& s = "a {x+1} b"'],
  ["& y = 1 - -2", "& y = 1 -  -2 -- a note"],
];

// Two scripts that differ in spacing that is displayed, or in tokens that
// spacing alone tells apart.
const OTHER_SPACING: [string, string][] = [
  ["Hello ((sfx)) there.", "Hello((sfx))there."],
  ["& y = 1 - -2", "& y = 1 - 2"],
  ["& local x = 1", "& localx = 1"],
];

// The kinds of `scope` the grammar reads in a script.
const read = (script: string, kinds: ReadonlySet<string>): Set<string> => {
  const found = new Set<string>();
  createSparkdownParser()
    .parse(script)
    .iterate({
      enter: (node) => {
        if (kinds.has(node.name)) {
          found.add(node.name);
        }
      },
    });
  return found;
};

describe("the text a fingerprint hashes", () => {
  test("has a sample for every comment and string kind the grammar defines", () => {
    const comments = new Set(kindsOf("comment"));
    const strings = new Set(kindsOf("string"));
    const sampled = new Set([
      ...COMMENTS.flatMap(([script]) => [...read(script, comments)]),
      ...STRINGS.flatMap(([script]) => [...read(script, strings)]),
    ]);
    const unsampled = [...comments, ...strings]
      .filter((kind) => !sampled.has(kind))
      .sort();
    expect(unsampled).toEqual(UNREAD);
  });

  test.each(COMMENTS)("leaves out the comment of %j", (script, without) => {
    expect(normalizeSource(script)).toBe(normalizeSource(without));
  });

  test.each(STRINGS)(
    "keeps the string of %j as written",
    (script, respaced) => {
      expect(normalizeSource(script)).not.toBe(normalizeSource(respaced));
    },
  );

  test.each(SAME_SPACING)(
    "leaves out the spacing of %j",
    (script, respaced) => {
      expect(normalizeSource(script)).toBe(normalizeSource(respaced));
    },
  );

  test.each(OTHER_SPACING)("keeps the spacing of %j", (script, respaced) => {
    expect(normalizeSource(script)).not.toBe(normalizeSource(respaced));
  });
});
