import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type AddCompilerFileMethod = typeof AddCompilerFileMessage.method;

export interface AddCompilerFileParams {
  uri: string;
  file: {
    type: string;
    name: string;
    ext: string;
    src: string;
    text?: string;
  };
}

export class AddCompilerFileMessage {
  static readonly method = "compiler/addFile";
  static readonly type = new MessageProtocolRequestType<
    AddCompilerFileMethod,
    AddCompilerFileParams,
    boolean
  >(AddCompilerFileMessage.method);
}
