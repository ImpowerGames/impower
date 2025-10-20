import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { File } from "../../types/File";

export type UpdateCompilerFileMethod = typeof UpdateCompilerFileMessage.method;

export interface UpdateCompilerFileParams {
  file: File;
}

export type UpdateCompilerFileResult = boolean;

export class UpdateCompilerFileMessage {
  static readonly method = "compiler/updateFile";
  static readonly type = new MessageProtocolRequestType<
    UpdateCompilerFileMethod,
    UpdateCompilerFileParams,
    UpdateCompilerFileResult
  >(UpdateCompilerFileMessage.method);
}

export namespace UpdateCompilerFileMessage {
  export interface Request
    extends RequestMessage<
      UpdateCompilerFileMethod,
      UpdateCompilerFileParams,
      UpdateCompilerFileResult
    > {}
  export interface Response
    extends ResponseMessage<
      UpdateCompilerFileMethod,
      UpdateCompilerFileResult
    > {}
}
