import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { File } from "../../types/File";

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
  export interface Request extends RequestMessage<
    UpdateCompilerFileMethod,
    UpdateCompilerFileParams,
    UpdateCompilerFileResult
  > {}
  export interface Response extends ResponseMessage<
    UpdateCompilerFileMethod,
    UpdateCompilerFileResult
  > {}
}
