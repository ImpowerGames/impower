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
  /** Filled in by the preview worker while the request is handled — the same
   *  object is returned as the result (see {@link SelectCompilerDocumentResult}). */
  checkpoint?: string;
  /** Why no checkpoint could be simulated, when there is none. */
  simulationFailure?: SimulationFailure;
}

export type SelectCompilerDocumentResult = {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  /** Why no checkpoint could be simulated, when there is none. */
  simulationFailure?: SimulationFailure;
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
  export interface Response extends ResponseMessage<
    SelectCompilerDocumentMethod,
    SelectCompilerDocumentResult
  > {}
}
