// Layout/screen directive + reference validation. The UI sublanguage:
//  - `layout NAME [in SCREEN] with … end` defines a mountable element tree;
//  - `screen NAME with … end` defines a navigation group (holds layouts);
//  - `[[open/close LAYOUT]]` and `[[navigate SCREEN to LAYOUT]]` flow through the
//    shared `[[…]]` (image-command) grammar.
// The validators must treat these as UI directives, not image directives:
//  - ValidationAnnotator accepts open/close/navigate as valid `[[…]]` controls;
//  - ReferenceAnnotator resolves open/close targets + navigate destinations as
//    `layout <name>` defines, the navigate group + `in <screen>` clause as
//    `screen <name>` defines (not as image layers).
// So a valid directive stays clean, and a typo lights up precisely.

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

const LAYOUT = `layout hud with
  text "HP"
end
`;

describe("layout lifecycle directive validation ([[open/close LAYOUT]])", () => {
  test("[[open hud]] for a defined layout produces no diagnostics", () => {
    expect(diagnosticsFor(LAYOUT + `[[open hud]]\n`)).toEqual([]);
  });

  test("[[close hud]] for a defined layout produces no diagnostics", () => {
    expect(diagnosticsFor(LAYOUT + `[[close hud]]\n`)).toEqual([]);
  });

  test("open/close inherit the with/over/after/wait clauses cleanly", () => {
    expect(
      diagnosticsFor(LAYOUT + `[[open hud with fade over 1s after 0.2s]]\n`),
    ).toEqual([]);
    expect(
      diagnosticsFor(LAYOUT + `[[close hud with fade over 0.5s wait]]\n`),
    ).toEqual([]);
  });

  test("the `ease` clause is validated (parity with images)", () => {
    expect(
      diagnosticsFor(LAYOUT + `[[open hud ease not_an_ease]]\n`).some((m) =>
        m.includes("ease"),
      ),
    ).toBe(true);
  });

  test("opening an undefined layout warns about the layout", () => {
    const diags = diagnosticsFor(LAYOUT + `[[open ghost]]\n`);
    expect(diags.some((m) => m.includes("Cannot find layout"))).toBe(true);
    expect(diags.some((m) => m.includes("Unrecognized"))).toBe(false);
  });

  test("a control verb used in the wrong bracket still warns", () => {
    // `play` is an audio verb; in `[[…]]` (visual brackets) it's invalid.
    const diags = diagnosticsFor(LAYOUT + `[[play hud]]\n`);
    expect(diags.some((m) => m.includes("Unrecognized"))).toBe(true);
  });
});

// A `menu` SCREEN holding two layouts. `[[navigate <screen> to <layout>]]`: the
// FIRST token is the navigation SCREEN, the destination LAYOUT follows `to`.
const MENU = `screen menu with
end
layout pause in menu with
  text "Paused"
end
layout settings in menu with
  text "Settings"
end
`;

describe("screen navigation directive validation ([[navigate SCREEN to LAYOUT]])", () => {
  test("a defined screen + in-screen layouts produce no diagnostics", () => {
    expect(diagnosticsFor(MENU + `[[navigate menu to settings]]\n`)).toEqual([]);
  });

  test("clauses after the destination validate cleanly", () => {
    expect(
      diagnosticsFor(MENU + `[[navigate menu to settings with fade over 1s]]\n`),
    ).toEqual([]);
  });

  test("`to` followed by a layout name does NOT trigger the numeric-`to` error", () => {
    const diags = diagnosticsFor(MENU + `[[navigate menu to settings]]\n`);
    expect(diags.some((m) => m.includes("should be followed by a number"))).toBe(
      false,
    );
  });

  test("navigating to an undefined layout warns about the layout", () => {
    const diags = diagnosticsFor(MENU + `[[navigate menu to ghost]]\n`);
    expect(diags.some((m) => m.includes("Cannot find layout"))).toBe(true);
  });

  test("an undefined screen warns about the screen", () => {
    const diags = diagnosticsFor(MENU + `[[navigate nogroup to settings]]\n`);
    expect(diags.some((m) => m.includes("Cannot find screen"))).toBe(true);
  });

  test("a LAYOUT name used as the screen warns it's not a screen", () => {
    // `pause` is a defined layout, not a screen → flag the mistake.
    const diags = diagnosticsFor(MENU + `[[navigate pause to settings]]\n`);
    expect(diags.some((m) => m.includes("Cannot find screen"))).toBe(true);
  });

  test("a bare [[navigate SCREEN]] (no `to`) warns it's incomplete", () => {
    const diags = diagnosticsFor(MENU + `[[navigate menu]]\n`);
    expect(diags.some((m) => m.includes("Incomplete"))).toBe(true);
  });
});

describe("layout `in SCREEN` clause validation", () => {
  test("`in` referencing a defined screen is clean", () => {
    expect(
      diagnosticsFor(`screen menu with\nend\nlayout pause in menu with\n  text "x"\nend\n`),
    ).toEqual([]);
  });

  test("`in` referencing an undefined screen warns (typo guard)", () => {
    const diags = diagnosticsFor(
      `layout pause in menyu with\n  text "x"\nend\n`,
    );
    expect(diags.some((m) => m.includes("Cannot find screen"))).toBe(true);
  });
});
