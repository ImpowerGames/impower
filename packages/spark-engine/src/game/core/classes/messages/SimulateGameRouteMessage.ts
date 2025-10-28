import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { RoutePlan } from "@impower/sparkdown/src/compiler/utils/planRoute";

export type SimulateGameRouteMethod = typeof SimulateGameRouteMessage.method;

export interface SimulateGameRouteParams {
  route: RoutePlan;
}

export interface SimulateGameRouteResult {
  checkpoint: string | null;
}

export class SimulateGameRouteMessage {
  static readonly method = "game/simulateRoute";
  static readonly type = new MessageProtocolRequestType<
    SimulateGameRouteMethod,
    SimulateGameRouteParams,
    SimulateGameRouteResult
  >(SimulateGameRouteMessage.method);
}

export namespace SimulateGameRouteMessage {
  export interface Request
    extends RequestMessage<
      SimulateGameRouteMethod,
      SimulateGameRouteParams,
      SimulateGameRouteResult
    > {}
  export interface Response
    extends ResponseMessage<SimulateGameRouteMethod, SimulateGameRouteResult> {}
}
