// `[[open SCREEN]]` / `[[close SCREEN]]` are screen-lifecycle directives that
// flow through the shared `[[...]]` (image-command) grammar. The validators must
// treat them as SCREEN directives, not image directives:
//  - ValidationAnnotator must accept `open`/`close` as valid `[[...]]` controls
//    (not flag them as "unrecognized visual control").
//  - ReferenceAnnotator must resolve the target as a `screen <name>` define
//    (symbolId `screen.<name>`), not as an unknown image layer.
// Otherwise a perfectly valid `[[open hud]]` lights up with spurious warnings.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnosticsFor(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push(typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d));
    }
  }
  return out;
}

const SCREEN = `screen hud with
  text "HP"
end
`;

describe("screen lifecycle directive validation", () => {
  test("[[open hud]] for a defined screen produces no diagnostics", () => {
    expect(diagnosticsFor(SCREEN + `[[open hud]]\n`)).toEqual([]);
  });

  test("[[close hud]] for a defined screen produces no diagnostics", () => {
    expect(diagnosticsFor(SCREEN + `[[close hud]]\n`)).toEqual([]);
  });

  test("open/close inherit the with/over/after/wait clauses cleanly", () => {
    expect(
      diagnosticsFor(SCREEN + `[[open hud with fade over 1s after 0.2s]]\n`),
    ).toEqual([]);
    expect(
      diagnosticsFor(SCREEN + `[[close hud with fade over 0.5s wait]]\n`),
    ).toEqual([]);
  });

  test("the `ease` clause is validated for screens too (parity with images)", () => {
    // A bogus ease name warns exactly as it would on an image directive — i.e.
    // the clause is parsed + validated, not ignored.
    expect(
      diagnosticsFor(SCREEN + `[[open hud ease not_an_ease]]\n`).some((m) =>
        m.includes("ease"),
      ),
    ).toBe(true);
  });

  test("opening an undefined screen warns (target validates against screens)", () => {
    const diags = diagnosticsFor(SCREEN + `[[open ghost]]\n`);
    expect(diags.some((m) => m.toLowerCase().includes("screen"))).toBe(true);
    // and the warning is about the missing screen, not the control verb
    expect(diags.some((m) => m.includes("Unrecognized"))).toBe(false);
  });

  test("a control verb used in the wrong bracket still warns", () => {
    // `play` is an audio verb; in `[[...]]` (visual brackets) it's invalid.
    const diags = diagnosticsFor(SCREEN + `[[play hud]]\n`);
    expect(diags.some((m) => m.includes("Unrecognized"))).toBe(true);
  });

});

// `[[navigate <container> to <screen>]]` — the FIRST token is a navigation
// CONTAINER (a screen's `in <container>` group), and the destination screen
// follows `to`. Validation:
//  - the container must be the `in <container>` of at least one screen
//    (`$container` property) — a bare screen name there warns "Cannot find
//    container X" (catches `[[navigate my_screen]]`);
//  - the destination after `to` must be a defined screen;
//  - `to` is followed by a screen NAME (not the numeric audio `to`) — no false
//    "should be followed by a number" error;
//  - a bare `[[navigate <container>]]` (no `to`) is incomplete.
const MENU = `screen pause in menu with
  text "Paused"
end
screen settings in menu with
  text "Settings"
end
`;

describe("screen navigation directive validation ([[navigate CONTAINER to SCREEN]])", () => {
  test("[[navigate menu to settings]] (defined screen in that container) is clean", () => {
    expect(diagnosticsFor(MENU + `[[navigate menu to settings]]\n`)).toEqual([]);
  });

  test("clauses after the destination validate cleanly", () => {
    expect(
      diagnosticsFor(MENU + `[[navigate menu to settings with fade over 1s]]\n`),
    ).toEqual([]);
  });

  test("`to` followed by a screen name does NOT trigger the numeric-`to` error", () => {
    const diags = diagnosticsFor(MENU + `[[navigate menu to settings]]\n`);
    expect(diags.some((m) => m.includes("should be followed by a number"))).toBe(
      false,
    );
  });

  test("navigating to an undefined screen warns about the screen", () => {
    const diags = diagnosticsFor(MENU + `[[navigate menu to ghost]]\n`);
    expect(diags.some((m) => m.includes("Cannot find screen"))).toBe(true);
  });

  test("an undefined container warns about the container", () => {
    const diags = diagnosticsFor(MENU + `[[navigate nogroup to settings]]\n`);
    expect(diags.some((m) => m.includes("Cannot find container"))).toBe(true);
  });

  test("a SCREEN name used as the container warns it's not a container", () => {
    // `pause` is a defined screen, not a container → flag the mistake.
    const diags = diagnosticsFor(MENU + `[[navigate pause to settings]]\n`);
    expect(diags.some((m) => m.includes("Cannot find container"))).toBe(true);
  });

  test("a bare [[navigate CONTAINER]] (no `to`) warns it's incomplete", () => {
    const diags = diagnosticsFor(MENU + `[[navigate menu]]\n`);
    expect(diags.some((m) => m.includes("Incomplete"))).toBe(true);
  });
});
