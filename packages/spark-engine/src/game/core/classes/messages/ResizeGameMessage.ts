import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type ResizeGameMethod = typeof ResizeGameMessage.method;

export const GAME_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;

export type GameAspectRatio = (typeof GAME_ASPECT_RATIOS)[number];

export type GameFit = "auto" | "ratio" | "height";

export type ResizeGameParams =
  | { height: number; aspectRatio?: never }
  | { aspectRatio: GameAspectRatio | "auto"; height?: never };

export interface ResizeGameResult {}

export class ResizeGameMessage {
  static readonly method = "game/resize";
  static readonly type = new MessageProtocolRequestType<
    ResizeGameMethod,
    ResizeGameParams,
    ResizeGameResult
  >(ResizeGameMessage.method);
}

export namespace ResizeGameMessage {
  export interface Request extends RequestMessage<
    ResizeGameMethod,
    ResizeGameParams,
    ResizeGameResult
  > {}
  export type Response = ResponseMessage<ResizeGameMethod, ResizeGameResult>;
}
