import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type PlayMethod = typeof PlayMessage.method;

export interface PlayParams {
  /** The program to play, by `programIdentity`: the runnable one the page
   *  holds the summary of. */
  program: string;
  /** Where PLAY starts, if anywhere but the top. */
  startFrom?: { file: string; line: number };
  /** The run replaces one that an edit restarted. */
  restarted?: boolean;
  /** The choices and conditions a route search favors, by path. */
  simulationOptions?: Record<
    string,
    {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    }
  >;
}

export interface PlayResult {
  /** A game is built for the program, or the worker no longer holds it. */
  built: boolean;
  /** The program holds compiled story content to run. */
  compiled?: boolean;
}

/**
 * Build PLAY's game in the worker, beside the game that previews: its own
 * story from the program the page names, put at the start point along the
 * route the worker replayed there. The game runs once the page has connected
 * to it (`player/connectPlay`) and asks it to (`player/startPlay`).
 */
export class PlayMessage {
  static readonly method = "player/play";
  static readonly type = new MessageProtocolRequestType<
    PlayMethod,
    PlayParams,
    PlayResult
  >(PlayMessage.method);
}

export namespace PlayMessage {
  export interface Request
    extends RequestMessage<PlayMethod, PlayParams, PlayResult> {}
}
