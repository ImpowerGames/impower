// Ported from inkjs `src/tests/specs/ink/Misc.spec.ts > tests paths`.
//
// `Path` is the runtime's hierarchical address class used by every
// divert + `ChoosePathString` + `VisitCountAtPathString` lookup. Strings
// like `"knot.stitch.label"` round-trip through the constructor into a
// `_components` list, and equality is component-wise. Absolute paths
// start with `.` (e.g. `".hello.1.world"`); paths without the leading
// dot are relative. The two are never equal even if the trailing
// components match.
//
// Sparkdown uses this class verbatim — pure unit test of a still-live
// runtime utility. Originally written for Jest; ported to vitest with
// explicit imports rather than relying on globals.

import { describe, expect, it } from "vitest";
import { Path } from "../../inkjs/engine/Path";

describe("Path", () => {
  it("equates by component list, distinguishing absolute from relative", () => {
    const path1 = new Path("hello.1.world");
    const path2 = new Path("hello.1.world");

    const path3 = new Path(".hello.1.world");
    const path4 = new Path(".hello.1.world");

    expect(path1.Equals(path2)).toBeTruthy();
    expect(path3.Equals(path4)).toBeTruthy();
    expect(path1.Equals(path3)).toBeFalsy();
  });
});
