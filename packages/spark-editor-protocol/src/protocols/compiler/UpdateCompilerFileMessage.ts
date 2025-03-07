import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UpdateCompilerFileMethod = typeof UpdateCompilerFileMessage.method;

export interface UpdateCompilerFileParams {
  file: {
    uri: string;
    type: string;
    name: string;
    ext: string;
    src: string;
    text?: string;
  };
}

export class UpdateCompilerFileMessage {
  static readonly method = "compiler/updateFile";
  static readonly type = new MessageProtocolRequestType<
    UpdateCompilerFileMethod,
    UpdateCompilerFileParams,
    boolean
  >(UpdateCompilerFileMessage.method);
}
