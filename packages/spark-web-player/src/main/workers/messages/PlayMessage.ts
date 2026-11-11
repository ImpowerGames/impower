import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { Delivery } from "@impower/spark-engine/src/game/core/utils/beatDrawing";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";

export type PlayMethod = typeof PlayMessage.method;

export interface PlayParams {
  program: string;
  startFrom?: { file: string; line: number };
  restarted?: boolean;
  delivery?: Delivery;
  save?: string;
}

export interface PlayResult {
  built: boolean;
  compiled?: boolean;
  run?: number;
  errors?: SimulationError[];
  refusal?: string;
}

export const OUTSIDE_EVERY_SCENE_REFUSAL =
  "This line is outside every scene. Put the cursor in a scene to play from there.";

export class PlayMessage {
  static readonly method = "player/play";
  static readonly type = new MessageProtocolRequestType<
    PlayMethod,
    PlayParams,
    PlayResult
  >(PlayMessage.method);
}

export namespace PlayMessage {
  export interface Request
    extends RequestMessage<PlayMethod, PlayParams, PlayResult> {}
}
