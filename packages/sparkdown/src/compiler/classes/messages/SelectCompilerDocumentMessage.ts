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
  /** Filled in by the compiler before the request is handled: a script the
   *  compiled program was built from has been edited since that compile, so
   *  the program's path locations describe where this document's lines used to
   *  be. Everything that would answer this selection from that program waits
   *  for the compile the edit scheduled instead. */
  programOutdated?: boolean;
}

export type SelectCompilerDocumentResult = {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  /** Why no checkpoint could be simulated, when there is none. */
  simulationFailure?: SimulationFailure;
  /** Mirrors the field of the same name on {@link SelectCompilerDocumentParams}. */
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
