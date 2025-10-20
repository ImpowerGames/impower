import { File } from "../../../../sparkdown/src/compiler/types/File";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
