import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  comparePrograms,
  main,
} from "../../../scripts/convertStructBodies.ts";
import { rewriteStructBodies } from "../../../scripts/structBodyRewrite.ts";

// #1229: the converter that rewrites the indented struct-body forms into the
// brace forms of #1222. Each rewrite is checked twice: against the text the
// ticket specifies, and by compiling the source before and after and
// comparing the programs, which is the converter's own self-check.

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The rewrite of `source`, after asserting it compiles to the same program
 *  and that a second run changes nothing. */
function converted(source: string): string {
  const result = rewriteStructBodies(source);
  expect(result.refusals).toEqual([]);
  expect(result.text).not.toBe(source);
  const comparison = comparePrograms(
    [{ label: "main.sd", text: source }],
    [{ label: "main.sd", text: result.text }],
    "main.sd",
    true,
  );
  expect(comparison.differences).toEqual([]);
  expect(rewriteStructBodies(result.text).text).toBe(result.text);
  return result.text;
}

const lines = (...l: string[]) => l.join("\n") + "\n";

describe("each old form becomes its brace form", () => {
  test("a header ending in `:` with deeper lines becomes a block closed at its indentation", () => {
    expect(
      converted(
        lines("style card with", "  > text:", "    color = red", "  width = 10", "end"),
      ),
    ).toBe(lines("style card with", "  > text {", "    color = red", "  }", "  width = 10", "end"));
  });

  test("a header ending in `:` with nothing beneath it loses its colon", () => {
    expect(
      converted(lines("layout hud with", "  row:", "    text:", "    stroke:", "end")),
    ).toBe(lines("layout hud with", "  row {", "    text", "    stroke", "  }", "end"));
  });

  test("in a struct body, a header with nothing beneath it becomes an empty block at every depth", () => {
    // Inside braces a bare word is a list value, so `key` would not do. The
    // morph's diagnostics stand on converted lines, and still compare equal.
    expect(
      converted(
        lines(
          "style s with",
          "  > a:",
          "  > b:",
          "    > c:",
          "    color = red",
          "end",
          "",
          "morph m with",
          "  clips:",
          "    - between: -- no layers yet",
          "    - targets:",
          "        - a",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "style s with",
        "  > a {}",
        "  > b {",
        "    > c {}",
        "    color = red",
        "  }",
        "end",
        "",
        "morph m with",
        "  clips {",
        "    { between {} } -- no layers yet",
        "    { targets {",
        "        a",
        "      }",
        "    }",
        "  }",
        "end",
      ),
    );
  });

  test("a layout or component line with deeper lines and no colon is refused: its two readers disagree", () => {
    // The layout tree nests the deeper lines under the element, as a block
    // does, but the static struct gives the element an empty entry and drops
    // them, where a block's static entry holds them. No brace spelling keeps
    // both, so the declaration is left as it was.
    for (const declaration of ["layout hud with", "component card(title) with"]) {
      const source = lines(declaration, "  column", "    text \"a\"", "end");
      const result = rewriteStructBodies(source);
      expect(result.refusals).toEqual([
        {
          line: 3,
          declaration: 1,
          reason:
            "deeper-indented lines under an element line with no colon, which the layout tree nests and the static struct drops",
        },
      ]);
      expect(result.text).toBe(source);
    }
    const braced = lines("layout hud with", "  column {", "    text \"a\"", "  }", "end");
    const comparison = comparePrograms(
      [{ label: "main.sd", text: lines("layout hud with", "  column", "    text \"a\"", "end") }],
      [{ label: "main.sd", text: braced }],
      "main.sd",
      true,
    );
    expect(comparison.differences).toContain('.context.layout.hud.column.text: undefined != "a"');
  });

  test("a bare `-` item with indented entries becomes a bare `{ … }` entry", () => {
    expect(
      converted(
        lines(
          "animation fade with",
          "  keyframes:",
          "    -",
          "      opacity = \"0\"",
          "    -",
          "      opacity = \"1\"",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "animation fade with",
        "  keyframes {",
        "    {",
        "      opacity = \"0\"",
        "    }",
        "    {",
        "      opacity = \"1\"",
        "    }",
        "  }",
        "end",
      ),
    );
  });

  test("`- key = value` with further entries becomes one `{ … }` entry holding all of them", () => {
    expect(
      converted(
        lines(
          "animation pulse with",
          "  keyframes:",
          "    - offset = 0",
          "      opacity = \"0\"",
          "    - offset = 1",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "animation pulse with",
        "  keyframes {",
        "    { offset = 0",
        "      opacity = \"0\"",
        "    }",
        "    { offset = 1 }",
        "  }",
        "end",
      ),
    );
  });

  test("`- key:` with further entries, and `- value`, in a morph", () => {
    expect(
      converted(
        lines(
          "morph blink with",
          "  clips:",
          "    - between:",
          "        - eyelash-left",
          "      targets:",
          "        - eyeball-white-left",
          "        - pupil-left",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "morph blink with",
        "  clips {",
        "    { between {",
        "        eyelash-left",
        "      }",
        "      targets {",
        "        eyeball-white-left",
        "        pupil-left",
        "      }",
        "    }",
        "  }",
        "end",
      ),
    );
  });

  test("bare-word classes become dotted classes", () => {
    expect(
      converted(
        lines(
          "layout main with",
          "  stage:",
          "    mask shadow_1",
          "    button outline secondary \"Go\" #width=5",
          "  choices:",
          "    choice 0:",
          "      text",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "layout main with",
        "  stage {",
        "    mask.shadow_1",
        "    button.outline.secondary \"Go\" #width=5",
        "  }",
        "  choices {",
        "    choice.0 {",
        "      text",
        "    }",
        "  }",
        "end",
      ),
    );
  });

  test("`slot` and `fill` keep their bare name, and a component call takes a block", () => {
    expect(
      converted(
        lines(
          "component panel with",
          "  column:",
          "    slot",
          "    slot footer",
          "end",
          "",
          "layout hud with",
          "  panel():",
          "    text \"body\"",
          "    fill footer:",
          "      text \"foot\"",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "component panel with",
        "  column {",
        "    slot",
        "    slot footer",
        "  }",
        "end",
        "",
        "layout hud with",
        "  panel() {",
        "    text \"body\"",
        "    fill footer {",
        "      text \"foot\"",
        "    }",
        "  }",
        "end",
      ),
    );
  });
});

describe("mixes, control blocks, comments and blank lines", () => {
  test("a nested mix of the forms in a style and an animation", () => {
    expect(
      converted(
        lines(
          "style button with",
          "  cursor = pointer",
          "  &.secondary:",
          "    background_color = slate_50",
          "    > text label:",
          "      text_weight = 600",
          "  @hovered, @pressed:",
          "    background_color = sky_50",
          "end",
          "",
          "animation slide with",
          "  target = layer.self",
          "  keyframes:",
          "    - offset = 0",
          "      transform = \"translateX(0)\"",
          "    -",
          "      transform = \"translateX(10px)\"",
          "  timing:",
          "    duration = 0.4",
          "    easing = \"ease-in-out\"",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "style button with",
        "  cursor = pointer",
        "  &.secondary {",
        "    background_color = slate_50",
        "    > text label {",
        "      text_weight = 600",
        "    }",
        "  }",
        "  @hovered, @pressed {",
        "    background_color = sky_50",
        "  }",
        "end",
        "",
        "animation slide with",
        "  target = layer.self",
        "  keyframes {",
        "    { offset = 0",
        "      transform = \"translateX(0)\"",
        "    }",
        "    {",
        "      transform = \"translateX(10px)\"",
        "    }",
        "  }",
        "  timing {",
        "    duration = 0.4",
        "    easing = \"ease-in-out\"",
        "  }",
        "end",
      ),
    );
  });

  test("a layout with `if`, `for` and `match`, with blocks in their branches", () => {
    expect(
      converted(
        lines(
          "layout inventory with",
          "  column panel:",
          "    if busy then",
          "      text \"busy\"",
          "    elseif done then",
          "      row done:",
          "        text \"done\"",
          "    else",
          "      text \"idle\"",
          "    end",
          "    for item in bag do",
          "      row item:",
          "        text \"{item.name}\"",
          "        button \"Use\" @click=use_item(item)",
          "    else",
          "      text empty \"Your bag is empty.\"",
          "    end",
          "    match mode do",
          "      case 1",
          "        row one:",
          "          text \"one\"",
          "    end",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "layout inventory with",
        "  column.panel {",
        "    if busy then",
        "      text \"busy\"",
        "    elseif done then",
        "      row.done {",
        "        text \"done\"",
        "      }",
        "    else",
        "      text \"idle\"",
        "    end",
        "    for item in bag do",
        "      row.item {",
        "        text \"{item.name}\"",
        "        button \"Use\" @click=use_item(item)",
        "      }",
        "    else",
        "      text.empty \"Your bag is empty.\"",
        "    end",
        "    match mode do",
        "      case 1",
        "        row.one {",
        "          text \"one\"",
        "        }",
        "    end",
        "  }",
        "end",
      ),
    );
  });

  test("comments and blank lines between entries stay put, and a block closes before them", () => {
    expect(
      converted(
        lines(
          "layout hud with",
          "  -- the panel",
          "  column:",
          "    -- inside the column",
          "    row:",
          "      text \"a\"",
          "      -- the end of the row",
          "",
          "    -- before the second row",
          "    row:",
          "      text \"b\"",
          "  -- after the column",
          "  text \"c\"",
          "end",
          "",
          "style hud with",
          "  > row: -- a trailing comment",
          "    gap = 4",
          "",
          "    width = 10",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "layout hud with",
        "  -- the panel",
        "  column {",
        "    -- inside the column",
        "    row {",
        "      text \"a\"",
        "      -- the end of the row",
        "    }",
        "",
        "    -- before the second row",
        "    row {",
        "      text \"b\"",
        "    }",
        "  }",
        "  -- after the column",
        "  text \"c\"",
        "end",
        "",
        "style hud with",
        "  > row { -- a trailing comment",
        "    gap = 4",
        "",
        "    width = 10",
        "  }",
        "end",
      ),
    );
  });

  test("CRLF line endings are kept, the added lines included", () => {
    const source = lines("style card with", "  > text:", "    color = red", "end").replace(/\n/g, "\r\n");
    expect(converted(source)).toBe(
      lines("style card with", "  > text {", "    color = red", "  }", "end").replace(/\n/g, "\r\n"),
    );
  });

  test("everything outside the struct bodies stays byte for byte", () => {
    const outside = lines(
      "define ui as config with",
      "  timing:",
      "    - a",
      "end",
      "",
      "scene start",
      "  ALICE:",
      "    Hello.",
      "end",
    );
    expect(converted(outside + lines("style s with", "  > a:", "    color = red", "end"))).toBe(
      outside + lines("style s with", "  > a {", "    color = red", "  }", "end"),
    );
  });
});

describe("declarations and lines found as the grammar finds them (round 1, comment 5939438817)", () => {
  test("an indented declaration converts, and prose ending in `with` is left alone", () => {
    expect(
      converted(
        lines(
          "  style s with",
          "    > a:",
          "      color = red",
          "  end",
          "",
          "scene start",
          "  ALICE:",
          "    animation plays with",
          "    me:",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "  style s with",
        "    > a {",
        "      color = red",
        "    }",
        "  end",
        "",
        "scene start",
        "  ALICE:",
        "    animation plays with",
        "    me:",
        "end",
      ),
    );
  });

  test("a multi-line comment's lines stay byte for byte, and no `}` lands inside it", () => {
    expect(
      converted(
        lines(
          "layout main with",
          "  row:",
          "    text \"a\"",
          "    --[[",
          "text muted \"comment\"",
          "  row:",
          "    ]]",
          "  text muted \"b\"",
          "end",
        ),
      ),
    ).toBe(
      lines(
        "layout main with",
        "  row {",
        "    text \"a\"",
        "    --[[",
        "text muted \"comment\"",
        "  row:",
        "    ]]",
        "  }",
        "  text.muted \"b\"",
        "end",
      ),
    );
  });

  test("an entry after a multi-line comment's end on the same line is refused", () => {
    // In a layout the grammar ends the declaration at that comment.
    const layout = lines("layout main with", "  row:", "    --[[ a", "    b ]] text muted \"c\"", "end");
    expect(rewriteStructBodies(layout)).toMatchObject({
      text: layout,
      refusals: [
        {
          line: 4,
          declaration: 1,
          reason: "the grammar ends this declaration before an `end` line; fix it by hand",
        },
      ],
    });
    // In a style body the declaration goes on, and the line is refused.
    const style = lines("style s with", "  > a:", "    --[[ a", "    b ]] color = red", "end");
    const result = rewriteStructBodies(style);
    expect(result.text).toBe(style);
    expect(result.refusals.map((r) => r.line)).toEqual([4]);
  });

  test("a declaration left without its `end` is reported", () => {
    const source = lines("style s with", "  > a:", "    color = red", "");
    expect(rewriteStructBodies(source)).toMatchObject({ text: source, declarations: 1, converted: 0 });
    expect(rewriteStructBodies(source).refusals).toHaveLength(1);
  });

  test("whitespace around an attribute's `=` is read as the grammar reads it", () => {
    expect(
      converted(lines("layout main with", "  row:", "    text muted #width = 5 \"A\"", "end")),
    ).toBe(lines("layout main with", "  row {", "    text.muted #width = 5 \"A\"", "  }", "end"));
  });

  test("a component call with deeper lines and no colon becomes a block", () => {
    expect(
      converted(
        lines("component card with", "  slot", "end", "", "layout main with", "  card()", "    text \"A\"", "end"),
      ),
    ).toBe(
      lines("component card with", "  slot", "end", "", "layout main with", "  card() {", "    text \"A\"", "  }", "end"),
    );
    const followed = lines("layout main with", "  row:", "    card(1) other", "end");
    expect(rewriteStructBodies(followed).refusals).toHaveLength(1);
  });

  test("a brace body that still holds a bare-word class is refused, not skipped", () => {
    for (const body of [["  row {}", "  text muted \"A\""], ["  row {", "    text muted \"A\"", "  }"], ["  title { stroke wide; text }"]]) {
      const source = lines("layout main with", ...body, "end");
      const result = rewriteStructBodies(source);
      expect(result.refusals.map((r) => r.reason), body.join(" / ")).toEqual([
        "the body already holds brace blocks beside indented forms; convert it by hand",
      ]);
      expect(result.text).toBe(source);
    }
    // A brace body with dotted classes only is already converted.
    const done = lines("layout main with", "  row {", "    text.muted \"A\" #width=5", "  }", "end");
    expect(rewriteStructBodies(done)).toMatchObject({ text: done, refusals: [], converted: 0 });
  });
});

describe("the self-check compares authored data exactly (round 1, comment 5939438817)", () => {
  const compare = (before: string, after: string) =>
    comparePrograms(
      [{ label: "main.sd", text: before }],
      [{ label: "main.sd", text: after }],
      "main.sd",
      true,
    ).differences;

  test("an authored key named `span` is compared", () => {
    expect(compare(lines("style custom with", "  span = 1", "end"), lines("style custom with", "  span = 2", "end"))).not.toEqual([]);
    expect(
      compare(
        lines("style custom with", "  span:", "    -", "    - 1", "end"),
        lines("style custom with", "  span {", "    {}", "    1", "  }", "end"),
      ),
    ).not.toEqual([]);
  });

  test("authored text that looks like a generated name is not renamed", () => {
    expect(
      compare(
        lines("layout main with", "  text \"__binding_file_3aabc_123\"", "end"),
        lines("layout main with", "  text \"__binding_file_3aabc_456\"", "end"),
      ),
    ).not.toEqual([]);
  });

  test("generated names still compare equal when only their offsets move", () => {
    expect(
      compare(
        lines("store n = 1", "layout main with", "  row:", "    text \"{n}\" #width={n}", "    button @click={ n = n + 1 }", "end"),
        lines("store n = 1", "", "", "layout main with", "  row {", "    text \"{n}\" #width={n}", "    button @click={ n = n + 1 }", "  }", "end"),
      ),
    ).toEqual([]);
  });
});

describe("a declaration whose old meaning cannot be carried over is refused and left as it was", () => {
  test("a deeper-indented line under a property in a style, animation, theme or morph body", () => {
    for (const kind of ["style", "animation", "theme", "morph"]) {
      const refused = lines(`${kind} a with`, "  color = red", "    width = 1", "end");
      const kept = lines("style b with", "  > c:", "    color = red", "end");
      const result = rewriteStructBodies(refused + kept);
      expect(result.refusals).toEqual([
        { line: 3, declaration: 1, reason: "a deeper-indented line under a property" },
      ]);
      expect(result.text).toBe(
        refused + lines("style b with", "  > c {", "    color = red", "  }", "end"),
      );
    }
  });

  test("a body that mixes tabs and spaces in its indentation", () => {
    const source = lines("style a with", "  > b:", "\t\tcolor = red", "end");
    const result = rewriteStructBodies(source);
    expect(result.refusals).toEqual([
      { line: 3, declaration: 1, reason: "the body's indentation mixes tabs and spaces" },
    ]);
    expect(result.text).toBe(source);
    // A body indented with tabs alone converts.
    expect(converted(lines("style a with", "\t> b:", "\t\tcolor = red", "end"))).toBe(
      lines("style a with", "\t> b {", "\t\tcolor = red", "\t}", "end"),
    );
  });

  test("element lines the brace form reads differently (#1224)", () => {
    for (const line of ["button \"Go\" other", "text b --[[ first ]] \"A\"", "button @click=go other"]) {
      const source = lines("layout a with", "  row:", `    ${line}`, "end");
      const result = rewriteStructBodies(source);
      expect(result.refusals).toHaveLength(1);
      expect(result.refusals[0]!.line).toBe(3);
      expect(result.text).toBe(source);
    }
  });

  test("a body that already holds brace blocks beside indented forms", () => {
    const source = lines("style a with", "  > b {", "    color = red", "  }", "  > c:", "    color = blue", "end");
    const result = rewriteStructBodies(source);
    expect(result.refusals).toHaveLength(1);
    expect(result.text).toBe(source);
  });
});

describe("the self-check", () => {
  test("it reports a program that differs", () => {
    const before = lines("layout main with", "  stage:", "    mask shadow_1", "end");
    const after = lines("layout main with", "  stage {", "    mask", "  }", "end");
    const comparison = comparePrograms(
      [{ label: "main.sd", text: before }],
      [{ label: "main.sd", text: after }],
      "main.sd",
      true,
    );
    expect(comparison.differences.length).toBeGreaterThan(0);
  });

  describe("the script", () => {
    let dir: string | undefined;
    afterEach(() => {
      vi.restoreAllMocks();
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    });
    const run = (args: string[]) => {
      const out: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
      vi.spyOn(console, "error").mockImplementation((...a) => void out.push(a.join(" ")));
      const code = main(dir!, args);
      vi.restoreAllMocks();
      return { code, out: out.join("\n") };
    };

    test("it writes a file whose programs agree and leaves one whose programs differ untouched", () => {
      dir = mkdtempSync(join(tmpdir(), "struct-body-converter-"));
      const good = lines("style s with", "  > a:", "    color = red", "end");
      // An empty `-` item: the indented readers drop it, while its `{}`
      // rewrite is an entry, so the programs differ.
      const bad = lines("animation a with", "  keyframes:", "    -", "    - offset = 0", "end");
      writeFileSync(join(dir, "good.sd"), good);
      writeFileSync(join(dir, "bad.sd"), bad);
      const { code, out } = run(["good.sd", "bad.sd"]);
      expect(code).toBe(1);
      expect(out).toContain("good.sd: 1 of 1 struct-body declarations converted");
      expect(out).toContain("programs identical");
      expect(out).toContain("programs differ; file left untouched");
      expect(readFileSync(join(dir, "good.sd"), "utf8")).toBe(
        lines("style s with", "  > a {", "    color = red", "  }", "end"),
      );
      expect(readFileSync(join(dir, "bad.sd"), "utf8")).toBe(bad);
    });

    test("`--check` writes nothing, and a refusal is reported with its file and line", () => {
      dir = mkdtempSync(join(tmpdir(), "struct-body-converter-"));
      const source = lines("style s with", "  > a:", "    color = red", "end", "", "style t with", "  color = red", "    width = 1", "end");
      writeFileSync(join(dir, "main.sd"), source);
      const { code, out } = run(["--check", "main.sd"]);
      expect(code).toBe(1);
      expect(out).toContain(
        "main.sd:8: refused the declaration at line 6: a deeper-indented line under a property",
      );
      expect(out).toContain("programs identical (--check: nothing written)");
      expect(readFileSync(join(dir, "main.sd"), "utf8")).toBe(source);
    });

    test("a project file `main.sd` does not reach is compared on its own, and its difference writes nothing (round 1, comment 5939438817)", () => {
      dir = mkdtempSync(join(tmpdir(), "struct-body-converter-"));
      const main = lines("style s with", "  > a:", "    color = red", "end");
      const unused = lines("animation a with", "  keyframes:", "    -", "    - offset = 0", "end");
      writeFileSync(join(dir, "main.sd"), main);
      writeFileSync(join(dir, "unused.sd"), unused);
      const { code, out } = run(["--project", "."]);
      expect(code).toBe(1);
      expect(out).toContain("compared from unused.sd:");
      expect(out).toContain("nothing written");
      expect(readFileSync(join(dir, "main.sd"), "utf8")).toBe(main);
      expect(readFileSync(join(dir, "unused.sd"), "utf8")).toBe(unused);
    });

    test("a project directory compiles as one program from its `main.sd`", () => {
      dir = mkdtempSync(join(tmpdir(), "struct-body-converter-"));
      writeFileSync(join(dir, "main.sd"), lines("layout hud with", "  row panel:", "    text \"a\"", "end"));
      writeFileSync(join(dir, "ui.sd"), lines("style panel with", "  > text:", "    color = red", "end"));
      const { code, out } = run(["--project", "."]);
      expect(code).toBe(0);
      expect(out).toContain("compared from main.sd:");
      expect(out).toContain("programs identical");
      expect(readFileSync(join(dir, "main.sd"), "utf8")).toBe(
        lines("layout hud with", "  row.panel {", "    text \"a\"", "  }", "end"),
      );
      expect(readFileSync(join(dir, "ui.sd"), "utf8")).toBe(
        lines("style panel with", "  > text {", "    color = red", "  }", "end"),
      );
    });
  });
});

test("the converted sources hold no indented form and convert to themselves", () => {
  for (const file of [
    "../../compiler/builtins/builtins.sd",
    "../../../../../docs/sparkle/pico-showcase.sd",
    "../../../../../docs/sparkle/reactive-smoke-test.sd",
    "__snapshots__/grammar/display/spaced-break-literal.sd",
  ]) {
    const text = readFileSync(join(__dirname, file), "utf8");
    const result = rewriteStructBodies(text);
    expect(result.refusals, file).toEqual([]);
    expect(result.text === text, file).toBe(true);
  }
});
