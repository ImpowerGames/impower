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
    ["@hovered @media (min-width: 1px), text @focused", ["@media (min-width: 1px)"]],
    ["@hovered @container-size(sm), text", ["@container-size(sm)"]],
    ["@hovered @media (min-width: 1px), #selected", ["@media (min-width: 1px)"]],
    ["@hovered @media (min-width: 1px), :focus", ["@media (min-width: 1px)"]],
    ["@hovered @media (min-width: 1px), [selected]", ["@media (min-width: 1px)"]],
    ["@hovered @media (min-width: 1px), frame :is(:not(.absent)) @focused", ["@media (min-width: 1px)"]],
    ["@hovered @media (min-width: 1px), frame :is(@focused)", ["@media (min-width: 1px)"]],
    ["@hovered @media (min-width: 1px), @focused @media (min-width: 2px)", ["@media (min-width: 1px)", "@media (min-width: 2px)"]],
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
    "@media (min-width: 1px), speech",
    "@hovered @media (min-width: 1px), text",
    "@hovered @container-size(sm), @focused @container-size(640px)",
    "@hovered @screen-size(sm) @screen-size(sm), @focused @screen-size(sm)",
    '@container style(--mode: dark), style(--mode: "@night")',
  ])("does not warn on %s", (selector) => {
    expect(warnings(selector, "at-rule-list")).toEqual([]);
  });
});

describe("a state written after an at-rule's condition is checked as a state (#2785)", () => {
  const messages = (selector: string) =>
    (compile(`${LAYOUTS}
style frame {
  ${selector} {
    opacity = 1
  }
}
`).diagnostics?.[MAIN] ?? []).map((d: any) => ({
      code: d.code,
      message: typeof d.message === "string" ? d.message : d.message.value,
    }));

  it.each([
    ["@media (min-width: 1px) @showing(missing)", "showing-name"],
    ["@supports (display: grid) @showing(missing)", "showing-name"],
    ["@scope (frame) @showing(missing)", "showing-name"],
  ])("%s warns on the name as it does before the condition", (selector, code) => {
    expect(messages(selector).filter((d) => d.code === code)).toHaveLength(1);
    expect(messages(selector.replace(/^(.*?) (@showing\(missing\))$/, "$2 $1")).filter((d) => d.code === code)).toHaveLength(1);
  });

  it("warns on an unknown state after the condition", () => {
    expect(messages("@media (min-width: 1px) @hoverd").filter((d) => d.message.includes("`@hoverd` is not a known state"))).toHaveLength(1);
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
