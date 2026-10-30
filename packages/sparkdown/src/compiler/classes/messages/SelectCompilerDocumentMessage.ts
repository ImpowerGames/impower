import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { Range } from "../../types/SparkDiagnostic";
import type { SimulationFailure } from "../../types/SimulationFailure";

export type SelectCompilerDocumentMethod =
  typeof SelectCompilerDocumentMessage.method;

export interface SelectCompilerDocumentParams {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
  programOutdated?: boolean;
}

export type SelectCompilerDocumentResult = {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
  programOutdated?: boolean;
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
  export interface Request extends RequestMessage<
    SelectCompilerDocumentMethod,
    SelectCompilerDocumentParams,
    SelectCompilerDocumentResult
  > {}
  export type Response = ResponseMessage<
    SelectCompilerDocumentMethod,
    SelectCompilerDocumentResult
  >;
}
