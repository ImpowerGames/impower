// How a sparkle body's INDENTATION and its element names are read.
//
// Both of these delete authored elements with no diagnostic — the layout just
// comes out smaller than it was written, which reads as "my element doesn't
// work" rather than "my source wasn't understood".

import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function layouts(source: string): any {
  const entries = compileSource(source);
  return entries.find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
}

/** Diagnostic messages, so a "silently" claim can actually be checked. */
function diagnostics(source: string): string[] {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const out: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      out.push(typeof d.message === "string" ? d.message : d.message?.value ?? "");
    }
  }
  return out;
}

describe("a whole-line comment occupies no indent slot", () => {
  // `--` was excluded by a string test and `//` was not, so a `//` comment
  // aligned with the block HEADER, or indented past the block's children, was
  // taken as a body line and consumed the block's children. `pico-showcase.sd`
  // has 90 whole-line `//`s — every one aligned with the line below it, which
  // is the only reason nothing shipped broken.
  const body = (comment: string, indent: string) =>
    `layout main with\n  stage:\n${indent}${comment}\n    portrait:\n    backdrop:\nend\n`;

  for (const marker of ["//", "--"]) {
    for (const [label, indent] of [
      ["at the children's column", "    "],
      ["at the block header's column", "  "],
      ["indented past the children", "      "],
    ] as const) {
      test(`\`${marker}\` ${label} keeps both children`, () => {
        const stage = layouts(body(`${marker} note`, indent))?.main?.children?.[0];
        expect(stage?.children?.length).toBe(2);
      });
    }
  }
});

describe("a line whose indentation matches nothing is reported", () => {
  test("an orphan line warns instead of vanishing", () => {
    const src = `layout main with
  stage:
    portrait:
      image
   text "orphan"
  backdrop:
end
`;
    // It still can't be placed — but it must not disappear in silence.
    expect(diagnostics(src).some((m) => m.includes("indentation"))).toBe(true);
  });

  test("a first line deeper than the rest doesn't discard the body", () => {
    // The base indent used to be the FIRST line's, so a deeper opening line
    // ended the walk immediately and threw away everything after it.
    const main = layouts(`layout main with
      stage:
  text "after1"
  text "after2"
  backdrop:
end
`)?.main;
    const flat = JSON.stringify(main);
    expect(flat).toContain("after1");
    expect(flat).toContain("after2");
    expect(flat).toContain("backdrop");
  });

  test("a lone DEDENTED stray doesn't re-base and destroy the body (#369)", () => {
    // The mirror image of the deep-first case: with a bare min() base, one
    // accidentally-dedented line became the base and every properly-indented
    // line was orphaned — the whole layout replaced by the stray. The
    // singleton at the minimum is the anomaly; it warns, the body survives.
    const src = `layout main with
  textbox:
    dialogue:
      text "hp"
 stray
end
`;
    const main = layouts(src)?.main;
    const flat = JSON.stringify(main);
    expect(flat).toContain("textbox");
    expect(flat).toContain("dialogue");
    expect(flat).toContain("hp");
    expect(flat).not.toContain("stray");
    expect(diagnostics(src).some((m) => m.includes("indentation"))).toBe(true);
  });

  test("a deeper opening line inside an if-branch doesn't discard the branch", () => {
    const src = `layout main with
  if true then
      text "a"
    text "b"
    text "c"
  end
end
`;
    // Same semantics as the top-level deep-first case: the deep opening line
    // becomes a WARNED orphan, and the rest of the branch survives. (With the
    // first line's indent as base, the walk exited at "b" and the branch kept
    // only "a" — silently.)
    const flat = JSON.stringify(layouts(src)?.main);
    expect(flat).toContain('"b"');
    expect(flat).toContain('"c"');
    expect(diagnostics(src).some((m) => m.includes("indentation"))).toBe(true);
  });
});

describe("the first name on a line is the tag", () => {
  // A colon HEADER re-tokenizes every word, so a trailing builtin also came
  // out as a builtin token and a builtin-first rule picked IT — giving an
  // element children changed what the element was.
  const el = (line: string, block: boolean) => {
    const src = block
      ? `layout main with\n  ${line}:\n    text "x"\nend\n`
      : `layout main with\n  ${line}\nend\n`;
    const c = layouts(src)?.main?.children?.[0];
    return { tag: c?.tag, classes: c?.classes };
  };

  for (const line of [
    "card footer",
    "shadow_1 mask",
    "mask shadow_1",
    "button text",
    "text button",
  ]) {
    test(`\`${line}\` reads the same with and without children`, () => {
      expect(el(line, true)).toEqual(el(line, false));
    });

    test(`\`${line}\` takes its first word as the tag`, () => {
      expect(el(line, false).tag).toBe(line.split(" ")[0]);
    });
  }

  // `list item:` warned "can only have one tag" where `list item` did not.
  test("a trailing builtin is a class, not a competing tag", () => {
    expect(
      diagnostics(`layout main with\n  list item:\n    text "x"\nend\n`).some(
        (m) => m.includes("only have one tag"),
      ),
    ).toBe(false);
  });

  // A slot whose NAME is a builtin must stay a slot.
  test("`slot footer` is a slot named footer", () => {
    const node = layouts(
      `component card with\n  slot footer\nend\nlayout main with\n  card()\nend\n`,
    );
    const entries = compileSource(
      `component card with\n  slot footer\nend\nlayout main with\n  card()\nend\n`,
    );
    const comp = entries.find((e: any) => e.block?.sparkle?.components)?.block
      ?.sparkle?.components;
    const slot = comp?.card?.children?.[0];
    expect(node).toBeTruthy();
    expect(slot?.kind).toBe("slot");
    expect(slot?.name).toBe("footer");
  });
});

describe("an inline custom property", () => {
  // No prop-name pattern admitted a leading `-`, so `#--my-var=4` matched
  // nothing, `LuauComment` claimed the rest of the line, and the prop plus
  // every attribute after it vanished with zero diagnostics — while the
  // unrecognized-prop warning was actively recommending that spelling.
  test("parses, and does not swallow the props after it", () => {
    const props =
      layouts(`layout main with
  row #--my-var=4 #gap=12:
    text "x"
end
`)?.main?.children?.[0]?.props ?? {};
    expect(Object.keys(props).sort()).toEqual(["--my-var", "gap"]);
  });
});
