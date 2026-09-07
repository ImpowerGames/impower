import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { File } from "../../types/File";

export type AddCompilerFileMethod = typeof AddCompilerFileMessage.method;

export interface AddCompilerFileParams {
  file: File;
}

export type AddCompilerFileResult = boolean;

export class AddCompilerFileMessage {
  static readonly method = "compiler/addFile";
  static readonly type = new MessageProtocolRequestType<
    AddCompilerFileMethod,
    AddCompilerFileParams,
    AddCompilerFileResult
  >(AddCompilerFileMessage.method);
}

export namespace AddCompilerFileMessage {
  export interface Request extends RequestMessage<
    AddCompilerFileMethod,
    AddCompilerFileParams,
    AddCompilerFileResult
  > {}
  export interface Response extends ResponseMessage<
    AddCompilerFileMethod,
    AddCompilerFileResult
  > {}
}
