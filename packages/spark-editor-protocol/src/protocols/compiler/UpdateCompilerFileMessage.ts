import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UpdateCompilerFileMethod = typeof UpdateCompilerFileMessage.method;

export interface UpdateCompilerFileParams {
  uri: string;
  file: {
    type: string;
    name: string;
    ext: string;
    path: string;
    src: string;
    text?: string;
  };
}

export class UpdateCompilerFileMessage {
  static readonly method = "compiler/updateFile";
  static readonly type = new MessageProtocolRequestType<
    UpdateCompilerFileMethod,
    UpdateCompilerFileParams,
    string
  >(UpdateCompilerFileMessage.method);
}
