import { expectWithinPin } from "./knownDifferences";
import { compareLanguages } from "./languageEquality";

export async function expectLanguagePin(
  ticket: number,
  source: string,
  pinned: readonly string[],
  treeParser?: Parameters<typeof compareLanguages>[2],
): Promise<void> {
  const { divergences } = await compareLanguages(source, {}, treeParser);
  expectWithinPin(
    { ticket: `I-${ticket}`, subject: JSON.stringify(source), list: 'the "known differences" block of languageEquality.test.ts' },
    pinned,
    divergences.map((d) => d.lineCol),
  );
}
