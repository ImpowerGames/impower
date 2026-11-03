import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export interface PreviewSaveFrame {
  flow?: string;
  scene?: string;
  uri?: string;
  line?: number;
  params: Record<string, string>;
}

export interface PreviewSave {
  id: string;
  kind: "lastRun" | "saved";
  name: string;
  scene: string;
  uri: string;
  line: number;
  time: number;
  data: string;
  entry?: {
    values: Record<string, string>;
    frames: PreviewSaveFrame[];
  };
  edits?: [string, string][];
  run?: string;
}

export type ListSavesMethod = typeof ListSavesMessage.method;

export interface ListSavesParams {}

export interface ListSavesResult {
  saves: PreviewSave[];
}

export class ListSavesMessage {
  static readonly method = "preview/listSaves";
  static readonly type = new MessageProtocolRequestType<
    ListSavesMethod,
    ListSavesParams,
    ListSavesResult
  >(ListSavesMessage.method);
}

export namespace ListSavesMessage {
  export interface Request extends RequestMessage<
    ListSavesMethod,
    ListSavesParams,
    ListSavesResult
  > {}
  export type Response = ResponseMessage<ListSavesMethod, ListSavesResult>;
}
