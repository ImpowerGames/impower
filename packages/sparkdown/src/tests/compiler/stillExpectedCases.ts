import type { FixKind } from "../../compiler/utils/closeMatch";

export interface StillExpectedCase {
  label: string;
  before: string;
  after: string;
  expect: string;
  kind?: FixKind;
  still: boolean;
}

const NEWLINE = String.fromCharCode(10);

export const STILL_EXPECTED_CASES: readonly StillExpectedCase[] = [
  { label: "an unchanged name", before: "show alcie", after: "show alcie", expect: "alcie", kind: "name", still: true },
  { label: "an unchanged name before a line break", before: "show alcie" + NEWLINE + "end", after: "show alcie" + NEWLINE + "end", expect: "alcie", kind: "name", still: true },
  { label: "a name with a different character", before: "show alcie", after: "show alcxe", expect: "alcie", kind: "name", still: false },
  { label: "a name extended by a letter", before: "show alcie", after: "show alciex", expect: "alcie", kind: "name", still: false },
  { label: "a name extended by an underscore and digit", before: "show alcie", after: "show alcie_2", expect: "alcie", kind: "name", still: false },
  { label: "a name extended by a hyphen", before: "show alcie", after: "show alcie-extra", expect: "alcie", kind: "name", still: false },
  { label: "a name extended at its start", before: "show alcie", after: "showxalcie", expect: "alcie", kind: "name", still: false },
  { label: "a name followed by a space", before: "show alcie", after: "show alcie later", expect: "alcie", kind: "name", still: true },
  { label: "an unchanged own-line note", before: "// TODO: fix this", after: "// TODO: fix this", expect: "// TODO: fix this", kind: "note", still: true },
  { label: "a note followed by trailing spaces", before: "// TODO: fix this", after: "// TODO: fix this  ", expect: "// TODO: fix this", kind: "note", still: true },
  { label: "a note extended on its line", before: "// TODO: fix this", after: "// TODO: fix this please", expect: "// TODO: fix this", kind: "note", still: false },
  { label: "a note with an edited word", before: "// TODO: fix this", after: "// TODO: fix that", expect: "// TODO: fix this", kind: "note", still: false },
  { label: "a note followed by another line", before: "// TODO: fix this" + NEWLINE + "Hello.", after: "// TODO: fix this" + NEWLINE + "Hello.", expect: "// TODO: fix this", kind: "note", still: true },
  { label: "plain text with no kind", before: "a = 1", after: "a = 1", expect: "a = 1", still: true },
  { label: "plain text with no kind, edited", before: "a = 1", after: "a = 2", expect: "a = 1", still: false },
];

export const caseRange = (testCase: StillExpectedCase) => {
  const from = testCase.before.indexOf(testCase.expect);
  return { from, to: from + testCase.expect.length };
};
