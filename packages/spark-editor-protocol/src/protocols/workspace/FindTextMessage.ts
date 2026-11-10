import { type Range } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type FindTextMethod = typeof FindTextMessage.method;

export interface FindTextOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface FindTextParams extends FindTextOptions {
  query: string;
  replacement?: string;
}

export interface FindTextMatch {
  range: Range;
  lineText: string;
  replacement?: string;
}

export interface FindTextScript {
  uri: string;
  matches: FindTextMatch[];
}

export type FindTextResult =
  | { total: number; scripts: FindTextScript[] }
  | { error: string };

export class FindTextMessage {
  static readonly method = "workspace/findText";
  static readonly type = new MessageProtocolRequestType<
    FindTextMethod,
    FindTextParams,
    FindTextResult
  >(FindTextMessage.method);
}

export namespace FindTextMessage {
  export interface Request extends RequestMessage<
    FindTextMethod,
    FindTextParams,
    FindTextResult
  > {}
  export type Response = ResponseMessage<FindTextMethod, FindTextResult>;
}
