import type { SparkProgram } from "../types/SparkProgram";

/** What a host that leaves a program where it was compiled still reads of it:
 *  its identity (`uri`, `scripts` and `filesEpoch`, see `programIdentity`),
 *  its version, the settings a preview starts from, and whether it runs. No
 *  path locations, context, assets or compiled story. */
export const programSummary = (
  program: SparkProgram,
  runnable: boolean,
): SparkProgram => ({
  uri: program.uri,
  scripts: program.scripts,
  files: {},
  version: program.version,
  filesEpoch: program.filesEpoch,
  workspace: program.workspace,
  startFrom: program.startFrom,
  simulationOptions: program.simulationOptions,
  summary: true,
  runnable,
});

/** Whether two programs, whole or summarized, are one compile's: the same
 *  `uri`, script versions and `filesEpoch` (see `programIdentity`). A host
 *  that receives summaries, or receives programs across a port, gets a new
 *  object for every answer, so object identity cannot say that a compile
 *  served the program it served before; these fields can. */
export const isSameProgram = (
  a: Pick<SparkProgram, "uri" | "scripts" | "filesEpoch"> | undefined | null,
  b: Pick<SparkProgram, "uri" | "scripts" | "filesEpoch"> | undefined | null,
): boolean => {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.uri !== b.uri || a.filesEpoch !== b.filesEpoch) {
    return false;
  }
  const scripts = Object.entries(a.scripts ?? {});
  return (
    scripts.length === Object.keys(b.scripts ?? {}).length &&
    scripts.every(([uri, version]) => b.scripts?.[uri] === version)
  );
};

/** Whether a program, whole or summarized, is one that runs: whether its
 *  compile built its statement chunks. */
export const isRunnableProgram = (
  program: SparkProgram | undefined | null,
): boolean =>
  program?.summary ? program.runnable === true : !!program?.chunks;
