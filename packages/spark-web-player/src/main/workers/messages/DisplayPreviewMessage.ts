import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";

export type DisplayPreviewMethod = typeof DisplayPreviewMessage.method;

export interface DisplayPreviewParams {
  program: string;
  file: string;
  line: number;
  speculative: boolean;
  keep?: string;
  real?: string;
  fresh?: boolean;
}

export interface DisplayPreviewResult {
  displayed: boolean;
  missing?: boolean;
  errors?: SimulationError[];
  path?: "beat" | "full" | "repeat";
  refused?: string;
}

export class DisplayPreviewMessage {
  static readonly method = "player/displayPreview";
  static readonly type = new MessageProtocolRequestType<
    DisplayPreviewMethod,
    DisplayPreviewParams,
    DisplayPreviewResult
  >(DisplayPreviewMessage.method);
}

export namespace DisplayPreviewMessage {
  export interface Request extends RequestMessage<
    DisplayPreviewMethod,
    DisplayPreviewParams,
    DisplayPreviewResult
  > {}
}
