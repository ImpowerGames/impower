import type { RuntimeDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { Diagnostic } from "@impower/spark-editor-protocol/src/types";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { IdentifiableProgram } from "./programIdentity";

const position = (p: { line: number; character: number }) => ({
  line: Math.max(0, p.line),
  character: Math.max(0, p.character),
});
export class RuntimeDiagnosticsRun {
  protected _errors = new Map<string, SimulationError>();

  constructor(
    readonly program: IdentifiableProgram,
    readonly owner: unknown,
  ) {}

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
