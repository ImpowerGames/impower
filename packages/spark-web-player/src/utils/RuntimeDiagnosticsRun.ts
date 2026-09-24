import type { RuntimeDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { Diagnostic } from "@impower/spark-editor-protocol/src/types";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { IdentifiableProgram } from "./programIdentity";

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

  /** Keep `error`, answering whether the run had not raised it before. */
  add(error: SimulationError): boolean {
    if (
      (error.type !== ErrorType.Error && error.type !== ErrorType.Warning) ||
      !error.location?.uri
    ) {
      return false;
    }
    const key = JSON.stringify([
      error.type,
      error.message,
      error.location.uri,
      error.location.range,
    ]);
    if (this._errors.has(key)) {
      return false;
    }
    this._errors.set(key, error);
    return true;
  }

  /** The run's errors as the editor's diagnostics. */
  params(): RuntimeDiagnosticsParams {
    const diagnostics: Record<string, Diagnostic[]> = {};
    // A statement's recorded location can start a character before its line,
    // and a diagnostic's position can never be negative.
    const position = (p: { line: number; character: number }) => ({
      line: Math.max(0, p.line),
      character: Math.max(0, p.character),
    });
    for (const { message, type, location } of this._errors.values()) {
      (diagnostics[location.uri] ??= []).push({
        range: {
          start: position(location.range.start),
          end: position(location.range.end),
        },
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
