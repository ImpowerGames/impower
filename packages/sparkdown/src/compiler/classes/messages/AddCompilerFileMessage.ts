import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { File } from "../../types/File";

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
  export interface Request
    extends RequestMessage<
      AddCompilerFileMethod,
      AddCompilerFileParams,
      AddCompilerFileResult
    > {}
  export interface Response
    extends ResponseMessage<AddCompilerFileMethod, AddCompilerFileResult> {}
}
