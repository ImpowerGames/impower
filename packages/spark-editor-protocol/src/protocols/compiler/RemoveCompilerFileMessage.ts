import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RemoveCompilerFileMethod = typeof RemoveCompilerFileMessage.method;

export interface RemoveCompilerFileParams {
  uri: string;
}

export class RemoveCompilerFileMessage {
  static readonly method = "compiler/removeFile";
  static readonly type = new MessageProtocolRequestType<
    RemoveCompilerFileMethod,
    RemoveCompilerFileParams,
    boolean
  >(RemoveCompilerFileMessage.method);
}
