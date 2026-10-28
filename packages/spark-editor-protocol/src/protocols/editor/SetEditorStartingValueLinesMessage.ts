import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetEditorStartingValueLinesMethod =
  typeof SetEditorStartingValueLinesMessage.method;

/** The lines, counting from 0, of each script that a once-only option's or
 *  an alternator's starting value is kept on, which the editor keeps on
 *  their lines through edits (`editor/startingValueLinesChanged`). */
export interface SetEditorStartingValueLinesParams {
  scripts: { uri: string; lines: number[] }[];
}

export interface SetEditorStartingValueLinesResult {}

export class SetEditorStartingValueLinesMessage {
  static readonly method = "editor/setStartingValueLines";
  static readonly type = new MessageProtocolRequestType<
    SetEditorStartingValueLinesMethod,
    SetEditorStartingValueLinesParams,
    SetEditorStartingValueLinesResult
  >(SetEditorStartingValueLinesMessage.method);
}

export namespace SetEditorStartingValueLinesMessage {
  export interface Request extends RequestMessage<
    SetEditorStartingValueLinesMethod,
    SetEditorStartingValueLinesParams,
    SetEditorStartingValueLinesResult
  > {}
  export type Response = ResponseMessage<
    SetEditorStartingValueLinesMethod,
    SetEditorStartingValueLinesResult
  >;
}
