import type { RuntimeDiagnosticsParams, RuntimeMorphBake } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { Diagnostic } from "@impower/spark-editor-protocol/src/types";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import { changeLookName } from "@impower/sparkdown/src/morph/diagnostics";
import type { MorphArtifact, MorphRef } from "@impower/sparkdown/src/morph/types";
import type { IdentifiableProgram } from "./programIdentity";

const position = (p: { line: number; character: number }) => ({
  line: Math.max(0, p.line),
  character: Math.max(0, p.character),
});
export class RuntimeDiagnosticsRun {
  protected _errors = new Map<string, SimulationError>();
  protected _changeBakes = new Map<string, RuntimeMorphBake>();

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

  addChangeBake(ref: MorphRef, artifact: MorphArtifact): boolean {
    const bake: RuntimeMorphBake = {
      image: ref.image,
      ...(ref.layered ? { layered: true as const } : {}),
      ...(ref.source === undefined ? {} : { source: ref.source }),
      variant: changeLookName(ref),
      diagnostics: artifact.diagnostics.map(({ code, severity, message, morphs, layer, path }) => ({
        code,
        severity,
        message,
        morphs,
        ...(layer === undefined ? {} : { layer }),
        ...(path === undefined ? {} : { path }),
      })),
    };
    const key = JSON.stringify([ref.image, ref.key]);
    const previous = this._changeBakes.get(key);
    if (previous && JSON.stringify(previous) === JSON.stringify(bake)) {
      return false;
    }
    if (!previous && bake.diagnostics.length === 0) {
      return false;
    }
    this._changeBakes.set(key, bake);
    return true;
  }

  keepChangeBakes(from: RuntimeDiagnosticsRun) {
    for (const [key, consumer] of from._changeBakes) {
      this._changeBakes.set(key, consumer);
    }
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
      ...(this._changeBakes.size > 0 ? { morphBakes: [...this._changeBakes.values()] } : {}),
    };
  }
}
