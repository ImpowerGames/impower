import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { Range } from "../../types/SparkDiagnostic";

export type SelectCompilerDocumentMethod =
  typeof SelectCompilerDocumentMessage.method;

export interface SelectCompilerDocumentParams {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
}

export type SelectCompilerDocumentResult = {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
};

export class SelectCompilerDocumentMessage {
  static readonly method = "compiler/select";
  static readonly type = new MessageProtocolRequestType<
    SelectCompilerDocumentMethod,
    SelectCompilerDocumentParams,
    SelectCompilerDocumentResult
  >(SelectCompilerDocumentMessage.method);
}

export namespace SelectCompilerDocumentMessage {
  export interface Request
    extends RequestMessage<
      SelectCompilerDocumentMethod,
      SelectCompilerDocumentParams,
      SelectCompilerDocumentResult
    > {}
  export interface Response
    extends ResponseMessage<
      SelectCompilerDocumentMethod,
      SelectCompilerDocumentResult
    > {}
}
