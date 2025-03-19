import { File } from "../../../../sparkdown/src/types/File";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
