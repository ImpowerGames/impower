import { hasCompiledProgram } from "../../binary/programBinary";
import type { SparkProgram } from "../types/SparkProgram";

/** What a host that leaves a program where it was compiled still reads of it:
 *  its identity (`uri` and `scripts`), its version, the settings a preview
 *  starts from, and whether it runs. No path locations, context, assets or
 *  compiled story. */
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

/** Whether a program, whole or summarized, produced a story that runs. */
export const isRunnableProgram = (
  program: SparkProgram | undefined | null,
): boolean =>
  program?.summary ? program.runnable === true : hasCompiledProgram(program);
