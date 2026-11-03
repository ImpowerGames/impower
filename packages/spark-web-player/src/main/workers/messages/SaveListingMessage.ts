import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SaveListed, SaveSource } from "@impower/spark-engine/src/game/core/types/GameSave";

export type SaveListingMethod = typeof SaveListingMessage.method;

export interface SaveListingParams {
  save: SaveSource;
  start: string;
}

export interface SaveListingResult {
  listed: SaveListed;
}

export class SaveListingMessage {
  static readonly method = "player/saveListing";
  static readonly type = new MessageProtocolRequestType<
    SaveListingMethod,
    SaveListingParams,
    SaveListingResult
  >(SaveListingMessage.method);
}

export namespace SaveListingMessage {
  export interface Request
    extends RequestMessage<SaveListingMethod, SaveListingParams, SaveListingResult> {}
}
