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
