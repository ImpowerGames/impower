import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { StartingValueListing } from "@impower/sparkdown/src/program/startingValueLiterals";

export type GetGameStartingValueListingMethod =
  typeof GetGameStartingValueListingMessage.method;

export interface GetGameStartingValueListingParams {
  start: string;
}

export interface GetGameStartingValueListingResult {
  listing?: StartingValueListing;
}

export class GetGameStartingValueListingMessage {
  static readonly method = "game/startingValueListing";
  static readonly type = new MessageProtocolRequestType<
    GetGameStartingValueListingMethod,
    GetGameStartingValueListingParams,
    GetGameStartingValueListingResult
  >(GetGameStartingValueListingMessage.method);
}

export namespace GetGameStartingValueListingMessage {
  export interface Request extends RequestMessage<
    GetGameStartingValueListingMethod,
    GetGameStartingValueListingParams,
    GetGameStartingValueListingResult
  > {}
  export type Response = ResponseMessage<
    GetGameStartingValueListingMethod,
    GetGameStartingValueListingResult
  >;
}
