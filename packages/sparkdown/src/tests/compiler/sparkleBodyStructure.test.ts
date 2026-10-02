// How a sparkle body's INDENTATION and its element names are read.
//
// Both of these delete authored elements with no diagnostic — the layout just
// comes out smaller than it was written, which reads as "my element doesn't
// work" rather than "my source wasn't understood".

import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function layouts(source: string): any {
  const entries = compileSource(source);
  return entries.find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
}

/** Diagnostic messages, so a "silently" claim can actually be checked. */
describe("an inline custom property", () => {
  // No prop-name pattern admitted a leading `-`, so `#--my-var=4` matched
  // nothing, `LuauComment` claimed the rest of the line, and the prop plus
  // every attribute after it vanished with zero diagnostics — while the
  // unrecognized-prop warning was actively recommending that spelling.
  test("parses, and does not swallow the props after it", () => {
    const props =
      layouts(`layout main with
  row #--my-var=4 #gap=12 {
    text "x"
  }
end
`)?.main?.children?.[0]?.props ?? {};
    expect(Object.keys(props).sort()).toEqual(["--my-var", "gap"]);
  });
});
