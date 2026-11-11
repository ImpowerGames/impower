import { describe, expect, it } from "vitest";
import {
  FIX_SNAPSHOT_PROOFS,
  textFingerprint,
  type FixSnapshotRoute,
} from "../src/utils/fixSnapshots";

const USE_ALICE = {
  changes: [{ from: 5, to: 10, insert: "alice" }],
  expect: "alcie",
  kind: "name" as const,
};

const published = [{ message: "Cannot find alcie" }, { message: "To do" }];

const CASES: {
  [R in FixSnapshotRoute]: {
    holds: Parameters<(typeof FIX_SNAPSHOT_PROOFS)[R]["holds"]>[0][];
    fails: Parameters<(typeof FIX_SNAPSHOT_PROOFS)[R]["holds"]>[0][];
  };
} = {
  openEditor: {
    holds: [{ fixVersion: 4, editorVersion: 4, touched: false }],
    fails: [
      { fixVersion: 3, editorVersion: 4, touched: false },
      { fixVersion: undefined, editorVersion: 4, touched: false },
      { fixVersion: 4, editorVersion: 4, touched: true },
    ],
  },
  closedScript: {
    holds: [{ fix: USE_ALICE, offered: [USE_ALICE] }],
    fails: [
      { fix: USE_ALICE, offered: null },
      { fix: USE_ALICE, offered: [] },
      { fix: USE_ALICE, offered: [{ ...USE_ALICE, changes: [{ from: 10, to: 15, insert: "alice" }] }] },
      { fix: USE_ALICE, offered: [{ ...USE_ALICE, expect: "alcxe" }] },
    ],
  },
  undoInEditor: {
    holds: [
      { text: "show alice", inserted: [{ from: 5, to: 10, text: "alice" }] },
      { text: "Hello.", inserted: [{ from: 6, to: 6, text: "" }] },
    ],
    fails: [
      { text: "show alicex", inserted: [{ from: 5, to: 11, text: "alice" }] },
      { text: "show", inserted: [{ from: 5, to: 10, text: "alice" }] },
    ],
  },
  undoElsewhere: {
    holds: [{ text: "show alice", after: textFingerprint("show alice") }],
    fails: [
      { text: "Intro. show alice", after: textFingerprint("show alice") },
      { text: "show alicia", after: textFingerprint("show alice") },
    ],
  },
  outlineScope: {
    holds: [{ row: [published[0]], published }],
    fails: [{ row: [{ message: "Cannot find alcie" }], published }],
  },
};

describe("the snapshot proof each fix route makes", () => {
  it("has one row, with what it proves and examples both ways, for every route", () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(FIX_SNAPSHOT_PROOFS).sort());
    for (const proof of Object.values(FIX_SNAPSHOT_PROOFS)) {
      expect(proof.route.length).toBeGreaterThan(0);
      expect(proof.proves.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(FIX_SNAPSHOT_PROOFS) as FixSnapshotRoute[])(
    "%s holds on its snapshot and refuses every stale one",
    (route) => {
      const holds = FIX_SNAPSHOT_PROOFS[route].holds as (input: unknown) => boolean;
      for (const input of CASES[route].holds) {
        expect(holds(input)).toBe(true);
      }
      for (const input of CASES[route].fails) {
        expect(holds(input)).toBe(false);
      }
    },
  );
});
