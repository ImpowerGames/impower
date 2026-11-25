// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { beforeAll, describe, expect, it } from "vitest";

const MAIN = "file:///proj/main.sd";

const LAYOUTS = `layout hud {
  frame {
    text = HUD
  }
}
`;

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 }] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

beforeAll(() => {
  compile(LAYOUTS);
}, 60_000);

const warnings = (selector: string, code: string) =>
  (compile(`${LAYOUTS}
style frame {
  ${selector} {
    opacity = 1
  }
}
`).diagnostics?.[MAIN] ?? [])
    .filter((d: any) => d.code === code)
    .map((d: any) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      line: d.range.start.line,
      from: d.range.start.character,
      to: d.range.end.character,
    }));

const listWarning = (selector: string, written: string, consequence = "this block never applies") => {
  const from = 2 + selector.indexOf(written);
  return {
    message: `\`${/^@[\w-]+/.exec(written)![0]}\` is not on every selector of this comma list, so ${consequence}.\n> Write each selector of the list as its own key`,
    line: 7,
    from,
    to: from + written.length,
  };
};

describe("a comma list whose selectors hold different at-rule states is reported on each at-rule state (#2785)", () => {
  it.each([
    ["@hovered, @media (min-width: 1px)", ["@media (min-width: 1px)"]],
    ["@media (min-width: 1px), @hovered", ["@media (min-width: 1px)"]],
    ["@hovered @container-size(sm), @focused", ["@container-size(sm)"]],
    ["@hovered @media (min-width: 1px), @focused @media (min-width: 2px)", ["@media (min-width: 1px)"]],
  ])("%s", (selector, written) => {
    expect(warnings(selector, "at-rule-list")).toEqual(written.map((w) => listWarning(selector, w)));
  });

  it.each([
    ["@theme(dark), @hovered", ["@theme(dark)"]],
    ["@theme(dark), @theme(light)", ["@theme(dark)", "@theme(light)"]],
  ])("says the screen preview drops %s, whose selectors hold different @theme states", (selector, written) => {
    expect(warnings(selector, "at-rule-list")).toEqual(
      written.map((w) => listWarning(selector, w, "the screen preview drops this block")),
    );
  });

  it.each([
    "@hovered @media (min-width: 1px)",
    "@media (min-width: 1px) @hovered",
    "@hovered @media (min-width: 1px), @focused @media (min-width: 1px)",
    "@hovered @theme(dark)",
    "@media (min-width: 1px)",
    "@hovered, @focused",
  ])("does not warn on %s", (selector) => {
    expect(warnings(selector, "at-rule-list")).toEqual([]);
  });
});

describe("@showing beside an at-rule state is accepted (#2785)", () => {
  it.each(["@showing(hud) @media (min-width: 1px)", "@media (min-width: 1px) @showing(hud)", "@showing(hud) @container-size(sm) @hovered"])(
    "does not warn on %s",
    (selector) => {
      expect(warnings(selector, "showing-position")).toEqual([]);
    },
  );
});
