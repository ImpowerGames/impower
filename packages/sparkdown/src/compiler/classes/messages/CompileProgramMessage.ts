import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { SparkProgram } from "../../types/SparkProgram";
import type { VersionedTextDocumentIdentifier } from "../../types/VersionedTextDocumentIdentifier";

export type CompileProgramMethod = typeof CompileProgramMessage.method;

export interface CompileProgramParams {
  textDocument: { uri: string };
  workspace?: string;
  startFrom?: { file: string; line: number };
  simulationOptions?: Record<
    string,
    {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    }
  >;
  /**
   * When true, the compiler marks every flow container with
   * `visitsShouldBeCounted = true`, so visit counts are tracked even for
   * containers that have no source-level `READ_COUNT` / `{knot}` reference.
   *
   * Mirrors inkjs's `CompilerOptions.countAllVisits` and the equivalent
   * field on the parsed-hierarchy `Story` (see
   * `inkjs/compiler/Parser/ParsedHierarchy/Story.ts`). The flag is read by
   * `FlowBase.GenerateRuntimeObject` to flip `Container.visitsShouldBeCounted`
   * on every knot/stitch/function.
   *
   * Defaults to `false` so production builds stay lean (visit-count slots
   * inflate the save-state and the runtime container metadata). Tests that
   * call `state.VisitCountAtPathString(...)` on containers without a
   * source-level reference need this set.
   */
  countAllVisits?: boolean;
  /**
   * Serialize the compiled program for THIS request, overriding
   * `SparkdownCompilerConfig.emitCompiledProgram` (#351).
   *
   * Lets a host suppress bytecode on its per-keystroke compiles and still ask
   * for it on the one compile that feeds a view. When the no-change
   * short-circuit serves a cached program that was built without bytecode,
   * it is materialized from the retained runtime story rather than recompiled.
   *
   * Omitted means "use the instance default".
   */
  emitCompiledProgram?: boolean;
}

export interface CompileProgramResult {
  /**
   * The document that was parsed.
   */
  textDocument: VersionedTextDocumentIdentifier;
  /**
   * The parsed program.
   */
  program: SparkProgram;
  /**
   * The simulated checkpoint for the new program.
   */
  checkpoint?: string;
}

export class CompileProgramMessage {
  static readonly method = "compiler/compile";
  static readonly type = new MessageProtocolRequestType<
    CompileProgramMethod,
    CompileProgramParams,
    CompileProgramResult
  >(CompileProgramMessage.method);
}

export namespace CompileProgramMessage {
  export interface Request extends RequestMessage<
    CompileProgramMethod,
    CompileProgramParams,
    CompileProgramResult
  > {}
  export interface Response extends ResponseMessage<
    CompileProgramMethod,
    CompileProgramResult
  > {}
}
