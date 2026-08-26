// Deciding whether the compiler worker and the player are holding the same
// compiled program (#385).
//
// The trap this exists to avoid: `program.version` looks like the obvious field
// to compare and is the one field that cannot be compared across the worker
// boundary. The compiler stamps it with the compiled script's document version,
// and `SparkdownWorkspace.compile` then overwrites it on the main thread's copy
// with the workspace's own per-project counter — a number that only advances
// when a compile produces a genuinely different program. So the two sides hold
// different numbers for the same program, and can hold the same number for
// different ones.
//
// `scripts` carries the per-script document versions and is never rewritten in
// transit, which is why the identity is built from that instead.

import { describe, expect, test } from "vitest";
import { programIdentity } from "../utils/programIdentity";

const URI = "file://proj/main.sd";

describe("identifying a compiled program across the worker boundary", () => {
  test("the same program gives the same identity", () => {
    expect(programIdentity({ uri: URI, scripts: { [URI]: 7 } })).toBe(
      programIdentity({ uri: URI, scripts: { [URI]: 7 } }),
    );
  });

  test("editing a script changes the identity", () => {
    expect(programIdentity({ uri: URI, scripts: { [URI]: 7 } })).not.toBe(
      programIdentity({ uri: URI, scripts: { [URI]: 8 } }),
    );
  });

  test("editing an imported script changes the identity", () => {
    // The compiler records every import it resolves in `scripts`, so a program
    // can change without its own entry moving. An identity built only from the
    // main script would call these two the same.
    const other = "file://proj/scene2.sd";
    expect(
      programIdentity({ uri: URI, scripts: { [URI]: 7, [other]: 2 } }),
    ).not.toBe(
      programIdentity({ uri: URI, scripts: { [URI]: 7, [other]: 3 } }),
    );
  });

  test("a different project gives a different identity", () => {
    expect(programIdentity({ uri: URI, scripts: { [URI]: 7 } })).not.toBe(
      programIdentity({
        uri: "file://other/main.sd",
        scripts: { [URI]: 7 },
      }),
    );
  });

  test("the identity does not depend on key order", () => {
    const a = "file://proj/a.sd";
    const b = "file://proj/b.sd";
    expect(programIdentity({ uri: URI, scripts: { [a]: 1, [b]: 2 } })).toBe(
      programIdentity({ uri: URI, scripts: { [b]: 2, [a]: 1 } }),
    );
  });

  test("`version` is ignored — it means different things on the two sides", () => {
    // This is the whole point. The worker's copy of one program and the
    // player's copy of that same program carry different `version` numbers, so
    // an identity that included it would report a mismatch on every message.
    const asTheWorkerHasIt = { uri: URI, scripts: { [URI]: 7 }, version: 7 };
    const asThePlayerHasIt = { uri: URI, scripts: { [URI]: 7 }, version: 2 };
    expect(programIdentity(asTheWorkerHasIt)).toBe(
      programIdentity(asThePlayerHasIt),
    );
  });

  test("no program means no identity, which matches nothing", () => {
    expect(programIdentity(undefined)).toBeUndefined();
    expect(programIdentity(null)).toBeUndefined();
    expect(programIdentity({})).toBeUndefined();
  });

  test("a program with no scripts still has an identity", () => {
    expect(programIdentity({ uri: URI })).toBeTruthy();
    expect(programIdentity({ uri: URI })).toBe(
      programIdentity({ uri: URI, scripts: {} }),
    );
  });
});
