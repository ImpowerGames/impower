import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";

export type ProgramForPlayMethod = typeof ProgramForPlayMessage.method;

export interface ProgramForPlayParams {
  /** The program to play, by `programIdentity`: the runnable one the page
   *  holds the summary of. */
  program: string;
  /** Where PLAY starts, if anywhere but the top. */
  startFrom?: { file: string; line: number };
}

export interface ProgramForPlayResult {
  /** The whole program, encoded by the compiler worker's program transport,
   *  or absent when the worker no longer holds that program. */
  program?: SparkProgram;
  /** The route the worker replayed to `startFrom`, as a compile reports it. */
  checkpoint?: string;
  simulatedPath?: string | null;
  simulatedProgramId?: string;
  simulationFailure?: any;
}

/**
 * The whole compiled program the page holds the summary of, for PLAY's
 * page-resident game, with the route to where PLAY starts. The program is the
 * one the page names, which is the last one that compiled and ran, even when
 * a later compile of the documents failed.
 */
export class ProgramForPlayMessage {
  static readonly method = "player/programForPlay";
  static readonly type = new MessageProtocolRequestType<
    ProgramForPlayMethod,
    ProgramForPlayParams,
    ProgramForPlayResult
  >(ProgramForPlayMessage.method);
}

export namespace ProgramForPlayMessage {
  export interface Request extends RequestMessage<
    ProgramForPlayMethod,
    ProgramForPlayParams,
    ProgramForPlayResult
  > {}
}
