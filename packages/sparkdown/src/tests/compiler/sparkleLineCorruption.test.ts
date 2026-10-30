import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function layouts(source: string): any {
  const entries = compileSource(source);
  return entries.find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
}

function contentText(content: any[] | undefined): string {
  return (content ?? [])
    .map((p: any) => (p.kind === "literal" ? p.text : "{}"))
    .join("");
}

describe("a trailing comment on a control-block opener", () => {
  const cases: [string, string][] = [
    ["if … then --", `  if ok then -- note\n    text "inside"\n  end\n`],
    ["if … then //", `  if ok then // note\n    text "inside"\n  end\n`],
    ["for … do --", `  for r in rows do -- note\n    text "inside"\n  end\n`],
    ["for … do //", `  for r in rows do // note\n    text "inside"\n  end\n`],
    [
      "match … do --",
      `  match n do -- note\n    case 1:\n      text "inside"\n  end\n`,
    ],
    [
      "else --",
      `  if ok then\n    text "a"\n  else -- note\n    text "inside"\n  end\n`,
    ],
    [
      "elseif … then --",
      `  if ok then\n    text "a"\n  elseif other then -- note\n    text "inside"\n  end\n`,
    ],
  ];

  for (const [label, body] of cases) {
    test(`${label} keeps the block body and the lines after it`, () => {
      const src =
        `store ok = true\nstore other = true\nstore n = 1\nstore rows = { 1 }\n` +
        `layout main with\n${body}  text "after"\nend\n`;
      const main = layouts(src)?.main;
      const flat = JSON.stringify(main);
      expect(flat).toContain("inside");
      expect(flat).toContain("after");
      expect(flat).not.toContain("note");
    });
  }
});

describe("an interpolated #prop does not become the element's content", () => {
  test("`text #label=\"…{x}…\"` renders no content of its own", () => {
    const main = layouts(`store c = 7
layout main with
  text #label="HP: {c}"
end
`)?.main;
    const el = main?.children?.[0];
    expect(el?.props?.label).toBeDefined();
    expect(contentText(el?.content)).toBe("");
  });

  test("authored content wins over an interpolated prop written before it", () => {
    const main = layouts(`store c = 7
layout main with
  text #label="HP: {c}" "Real content"
end
`)?.main;
    const el = main?.children?.[0];
    expect(contentText(el?.content)).toBe("Real content");
  });

  test("content written before the prop is unaffected", () => {
    const main = layouts(`store c = 7
layout main with
  text "Real content" #label="HP: {c}"
end
`)?.main;
    expect(contentText(main?.children?.[0]?.content)).toBe("Real content");
  });
});

describe("escape sequences in element content", () => {
  test("`\\\"` inside double-quoted content becomes a quote", () => {
    const main = layouts(`layout main with
  text "say \\"hi\\""
end
`)?.main;
    expect(contentText(main?.children?.[0]?.content)).toBe('say "hi"');
  });

  test("single-quoted content still carries its quotes literally", () => {
    const main = layouts(`layout main with
  text 'say "hi"'
end
`)?.main;
    expect(contentText(main?.children?.[0]?.content)).toBe('say "hi"');
  });
});

describe("a bare event handler followed by a comment", () => {
  test("`@click=use -- note` is still a ref to `use`", () => {
    const main = layouts(`function use()
end
layout main with
  button "C" @click=use -- note
end
`)?.main;
    const ev = main?.children?.[0]?.events?.[0];
    expect(ev?.event).toBe("click");
    expect(ev?.handler?.kind).toBe("ref");
    expect(ev?.handler?.name).toBe("use");
  });

  test("`@click=use // note` is still a ref to `use`", () => {
    const main = layouts(`function use()
end
layout main with
  button "C" @click=use // note
end
`)?.main;
    const ev = main?.children?.[0]?.events?.[0];
    expect(ev?.handler?.kind).toBe("ref");
    expect(ev?.handler?.name).toBe("use");
  });

  test("`@click=use(1)` is still a call", () => {
    const main = layouts(`function use(n)
end
layout main with
  button "C" @click=use(1)
end
`)?.main;
    expect(main?.children?.[0]?.events?.[0]?.handler?.kind).toBe("call");
  });
});

describe("a handler written before the content string", () => {
  test("`button @click=f \"Press\"` keeps both the label and the handler", () => {
    const main = layouts(`function on_click()
end
layout main with
  button @click=on_click "Press"
end
`)?.main;
    const el = main?.children?.[0];
    expect(contentText(el?.content)).toBe("Press");
    const ev = el?.events?.[0];
    expect(ev?.handler?.kind).toBe("ref");
    expect(ev?.handler?.name).toBe("on_click");
  });

  test("`@click=f(1, \"x\")` still parses as one call", () => {
    const main = layouts(`function f(a, b)
end
layout main with
  button "P" @click=f(1, "x")
end
`)?.main;
    const el = main?.children?.[0];
    expect(contentText(el?.content)).toBe("P");
    const ev = el?.events?.[0];
    expect(ev?.handler?.kind).toBe("call");
    expect(ev?.handler?.binding?.source).toContain('f(1, "x")');
  });
});
