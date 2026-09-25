import type { RuntimeDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { Diagnostic } from "@impower/spark-editor-protocol/src/types";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { IdentifiableProgram } from "./programIdentity";

/** A place as a diagnostic can hold it. A statement's recorded location can
 *  start a character before its line, and a position is never negative. */
const position = (p: { line: number; character: number }) => ({
  line: Math.max(0, p.line),
  character: Math.max(0, p.character),
});
/**
 * The runtime errors and warnings one run has raised: PLAY, or the preview at
 * one position with the route replayed to it. Each is kept once however
 * often the run raises it at the same place, and only errors and warnings
 * are kept, since information is not a problem in the script.
 */
export class RuntimeDiagnosticsRun {
  protected _errors = new Map<string, SimulationError>();

  constructor(
    /** The program the run was built from. */
    readonly program: IdentifiableProgram,
    /** What reports the run's errors as they are raised; a report from
     *  anything else belongs to another run. */
    readonly owner: unknown,
  ) {}

  /** Keep `error`, answering whether the run had not raised it before. Its
   *  place is kept as it is published, so two reports of one problem that
   *  differ only where a place is out of range are one diagnostic. */
  add(error: SimulationError): boolean {
    if (
      (error.type !== ErrorType.Error && error.type !== ErrorType.Warning) ||
      !error.location?.uri
    ) {
      return false;
    }
    const range = {
      start: position(error.location.range.start),
      end: position(error.location.range.end),
    };
    const key = JSON.stringify([
      error.type,
      error.message,
      error.location.uri,
      range,
    ]);
    if (this._errors.has(key)) {
      return false;
    }
    this._errors.set(key, {
      ...error,
      location: { uri: error.location.uri, range },
    });
    return true;
  }

  /** The run's errors as the editor's diagnostics. */
  params(): RuntimeDiagnosticsParams {
    const diagnostics: Record<string, Diagnostic[]> = {};
    for (const { message, type, location } of this._errors.values()) {
      (diagnostics[location.uri] ??= []).push({
        range: location.range,
        severity: type === ErrorType.Error ? 1 : 2,
        message,
        source: "runtime",
      });
    }
    return {
      program: {
        uri: this.program.uri ?? "",
        scripts: { ...this.program.scripts },
      },
      diagnostics,
    };
  }
}
