import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RemoveCompilerFileMethod = typeof RemoveCompilerFileMessage.method;

export interface RemoveCompilerFileParams {
  file: { uri: string };
}

export type RemoveCompilerFileResult = boolean;

export class RemoveCompilerFileMessage {
  static readonly method = "compiler/removeFile";
  static readonly type = new MessageProtocolRequestType<
    RemoveCompilerFileMethod,
    RemoveCompilerFileParams,
    RemoveCompilerFileResult
  >(RemoveCompilerFileMessage.method);
}

export namespace RemoveCompilerFileMessage {
  export interface Request
    extends RequestMessage<
      RemoveCompilerFileMethod,
      RemoveCompilerFileParams,
      RemoveCompilerFileResult
    > {}
  export interface Response
    extends ResponseMessage<
      RemoveCompilerFileMethod,
      RemoveCompilerFileResult
    > {}
}
