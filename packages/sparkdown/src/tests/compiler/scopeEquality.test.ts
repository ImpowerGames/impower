import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, "__snapshots__/grammar");

const TARGETED: Record<string, string> = {
  "assign-trailing-space-in-function":
    "function greet()\n    x = \n    local z = 1\nend\n",
  "assign-no-trailing-space-in-function":
    "function greet()\n    x =\n    local z = 1\nend\n",
  "operator-at-line-end-before-statement":
    "function f(t)\n  store x = 1 +\n  local y = 2 +;\nend\n",
  "doc-param-tag-at-column-0":
    "function f()\n  --[[\n\\param x the value\n  ]]\n  return 1\nend\n",
  "assign-trailing-space-top-level": "x = \nlocal z = 1\n",
  "next-line-method-trivia":
    "function f()\n  flag:\n\n  -- a note\n  m()\n  flag: --[[note]] m()\n  flag:\n  --[[note]] end\nend\nfunction g()\n  flag:\n  --[[note]] (1)\n  flag:\n  --[[note]] then\nend\nAfter {f()}.\n",
  "long-string-call-argument":
    "function f()\n  print [===[\nend\n]===]\nend\nAfter.\n",
  "long-string-call-chains":
    "function run()\n  a.b [=[x]=]\n  a:m [==[x]==]\n  f() [===[x]===]\n  a[1] [=[x]=]\n  local value = a[ [=[key]=] ]\nend\n",
  "struct-list-embedded-colons":
    "theme t with\nlinks {\nhttps://example.com\n12:30\nasset:icon\n}\nend\n",
  "scene-trailing-colon":
    "scene TEASER:\n\n    $: CLOSEUP - ACE OF SPADES\n\n    BUNNY:\n      Hello.\n",
  "branch-trailing-colon": "branch X:\n  Hello.\n",
  "scene-trailing-junk": "scene main :@!\n  Hello.\n",
  "scene-trailing-comment": "scene main // a note\n  Hello.\n",
  "scene-trailing-annotation": "scene main # tag\n  Hello.\n",

  "scene-nested-dialogue":
    "scene main\n\n    BUNNY:\n      Hello.\n\n    ACE:\n      Hi there.\n",
  "scene-colon-nested-dialogue":
    "scene main:\n\n    BUNNY:\n      Hello.\n",

  "blockaction-blank-lines":
    ":\n    Line one.\n\n    Line two.\n\nnot indented closes it\n",
  "dialogue-blank-lines":
    "BUNNY:\n  Hello there.\n\n  Still talking.\nACTION resumes.\n",

  "blockaction-comment-lines":
    ":\n    Line one.\n    // a comment line\n    Line two.\nnot indented\n",

  "column-0-after-if-expression-narrative":
    "scene s\n  x = if c then 1\nprint(x)\n  x = if c then\nHello.\n  if c then\n    x = if c\nprint(x)\n  end\nend\n",
  "column-0-after-else-narrative":
    "x = if c then 1 else\nprint(x)\nscene s\n  x = if c then 1 else\nHello.\n  x = if c then 1 else\ny = 6\nend\n",
  "column-0-after-if-expression-function":
    "function f(c)\n  x = if c then 1\nprint(x)\n  x = if c then\nprint(x)\n  return x\nend\n",
  "column-0-after-else-function":
    "function f(c)\n  x = if c then 1 else\nprint(x)\n  local y = if c then 1 else\ny = 6\n  return y\nend\n",

  "include": "include script.sd\n",
  "front-matter": "---\ntitle: Test\n---\n\nAction line.\n",
  "choice": "scene main\n  + a choice -> END\n  + another -> END\nend\n",
  "if-then-block": "if x > 0 then\n  Positive.\nend\n",
  "if-then-blank-lines": "if x > 0 then\n  Positive.\n\n  More.\nend\n",
  "do-block": "do\n  Inside the block.\nend\n",
  "interpolation": "The value is {x.name} today.\n",
  "knot": "= start\n  Hello.\n  -> END\n",
  "plain-action": "Just a line of action.\n\nAnother paragraph.\n",

  "struct-scalar-props":
    "style panel with\n  position = absolute\n  font_size = 3.4cqh\nend\n",
  "struct-scalar-dash-value":
    "style panel with\n  margin = -3px\n  aspect_ratio = 4/3\nend\n",
  "struct-object-headers":
    "style dialogue with\n  @screen-size(sm):\n    width = 100%\n  > text:\n    color = black\nend\n",
  "struct-attr-selector-with-equals":
    "style shadow with\n  > #image^=raffles_:\n    background_color = #E5323E\nend\n",
  "struct-bare-markers":
    "layout main with\n  portrait:\n    mask shadow_1\n    image\nend\n",
  "struct-array-items":
    "style list with\n  items:\n    - first\n    - second\nend\n",
  "struct-comment-line":
    "style panel with\n  position = absolute\n  -- background_color = rgba(0,0,0,0.8)\n  font_size = 3.4cqh\nend\n",
  "struct-brace-quoted-selector":
    "style panel with\n  &[data-label=\"a b;{\"] { color = red }\n  &[data-label=\"x\" i], &.on { color = blue }\n  &[data-label='a;b'] { opacity = 0.5 }\n  &[data-label='space ; { --'], &[data-kind=\"x\"] = { opacity = 0.25 }\nend\n",
  "struct-brace-quoted-container":
    'theme t with\n  "quoted key" { v = 1 }\n  "other" = { w = 2 }\n  outer {\n    accents:,\n      v = 1\n  }\nend\n',
  "struct-brace-value-starts-with-comment-mark":
    "theme t with\n  k = --gap }\n  j = // x }\n  g {\n    k = --gap\n    j = // note\n  }\nend\n",

  "tag-interpolation": "# pic{amount}{color}.jpg\n",
  "tag-interpolation-midbody": "# a tag {var} more\n",
  "tag-plain-no-interp": "# plain tag no interp\n",
  "tag-multi-with-interp": "# a # b {x}\n",
  "tag-midline-required-whitespace-886": "Text # a {var}\n",

  "struct-dollar-key-828":
    "theme t with\n  g:\n    $c = 3\nend\ntheme u with\n  g { $c = 3 }\nend\n",

  "unread-attribute-list-921":
    "Value {g()}.\nfunction g()\n  @[deprecated]\n  local function f()\n    return 1\n  end\n  return f()\nend\n",
  "unread-semicolon-in-call-1258": "function f(t)\n  print(1;)\nend\nAfter.\n",
  "unread-table-type-assignment-1261":
    "function f(t)\n  local x: {\n    bar\n    baz = 1 +\n  } = {}\n  2\nend\nAfter.\n",
  "unread-stray-closers-1290":
    "function f()\n  print(1)\n  )\n  ]\n  }\n  print(1); )\n  return 5\nend\nAfter.\n",
  "unread-export-in-function-1318": "function f()\n  export local a = 1\n  return a\nend\n: {f()}\n",
  "unread-union-instantiation-1376":
    "local function g<T>() end\nfunction f()\n  g<<number | string>>()\n  return 1\nend\nValue {f()}.\n",
  "unread-stray-then-1596": "function f(c)\nthen\nend\nAfter.\n",
  "unread-if-expression-after-comment-1647":
    "function f(c)\n  local x = --[[ c ]] if c then\n    1\n  else 2\n  return x\nend\nValue {f(true)}.\n",
  "non-ascii-names-1266":
    "theme t with\n  g:\n    名 = 2\n    tail = 3\nend\nscene 場面\n  Hello.\nend\nfunction f()\n  local x名 = 1\nend\n",
  "token-classes-1906":
    "function f(c)\n  local style, match, queue, continue = 1, 2, 3, 4\n  local y = style + match + queue + continue\n  if match then y = layout end\n  if match == (2)then y = 2 end\n  while y == (0)do y = 1 end\n  repeat\n    repeat y = (y + 1)until true\n  until y > 2\n  local z =\n    if c then 1 else 2\n  do local w = (1)end\n  if c then\n    while c do y = 1 else y = 2 end\n  end\n  return y\nend\n",
  "story-line-rule-trailing-operator-1254":
    "local a = 1 +\nThe first story line.\nscene s\n  local b = \"x\" ..\n  Story.\n  b = true and\n  Story.\nend\n",
  "story-line-rule-if-arms-1658":
    "store ready = true\nstore x = 0\nx = if ready then 1 else\nThe hero waits.\nlocal y = if ready then\n  1 else 2\nlocal z = if ready then 1 else\nender\n",
  "story-line-rule-comments-1200-1207":
    "local --[[c]] r = 1\nlocal --[[c]]q = 1\nlocal a --[[b]]print(1)\nlocal a2: number --[[b]] print(1)\nlocal a3 --[[b\n]]print(1)\nstore s --[[b]]print(1)\nlocal s2 = [[a\nb]]\n",
  "story-line-rule-if-header-1199":
    "store flag = true\nif flag:\n  Went down the true side.\nend\nif\n  flag\nthen\n  Story.\nelseif\n  Story.\nend\n",
  "story-line-rule-brackets":
    "store inventory = {\n  sword = 1,\n}\nlocal x = math.max(1,\n  2)\n& print(1,\n  2)\nlocal t: {\n  a: number\n} = { a = 1 }\nstore f = @[\n  native\n] function() return 5 end\nlocal y = f(g(\n  1\nbranch b\n  After.\nend\n",
  "story-line-rule-type-lines":
    "local v: number?\n| string\nlocal w: number\n& w = 2\nstore second = @[native]\nfunction() return 9 end\n",
  "unread-character-in-open-statement":
    "function f()\n  x = 1 @@ 2\n  y = $5\nend\ndefine X with\n  b = $5\nend\nlayout main with\n  button @click={ x = 1 @@ 2 }\nend\n",
  "capture-context-trailing-whitespace-1566":
    "BUNNY:   \nHello there.   \n@ ACE  \n  Hi.  \n(quietly)  \nscene main\n  BUNNY:  \n  Hello.  \n  (beat)  \nend\n",
  "capture-context-doc-param-1566":
    "function f(x)\n  --[[ @param x the value ]]\n  -- @param y other\n  return x\nend\n",
  "capture-context-luau-names-1566":
    "local x: number? = 1\nfunction f(a: string?, b: {number}?): number?\n  scene = a\n  branch += 1\n  return nil\nend\nfunction a.b:c()\nend\n",
};

interface Fixture {
  category: string;
  name: string;
  source: string;
}

function loadCorpus(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const category of readdirSync(CORPUS_DIR)) {
    const categoryDir = join(CORPUS_DIR, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir)) {
      if (!file.endsWith(".sd")) continue;
      fixtures.push({
        category,
        name: file.slice(0, -3),
        source: readFileSync(join(categoryDir, file), "utf8"),
      });
    }
  }
  return fixtures;
}

async function assertEqual(source: string) {
  const result = await compareEnginesFull(source);
  expect(
    result.divergences,
    formatDivergences(result.source, result.divergences),
  ).toEqual([]);
}

describe("engine scope-stack equality", () => {
  describe("targeted fixtures", () => {
    for (const [name, source] of Object.entries(TARGETED)) {
      test(name, async () => {
        await assertEqual(source);
      });
    }
  });

  describe("snapshot corpus", () => {
    for (const fixture of loadCorpus()) {
      test(`${fixture.category}/${fixture.name}`, async () => {
        await assertEqual(fixture.source);
      });
    }
  });
});
