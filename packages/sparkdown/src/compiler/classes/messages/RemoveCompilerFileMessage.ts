import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

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
