import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { GameConfiguration } from "../../types/GameConfiguration";
import { SaveData } from "../../types/SaveData";

export type CreateGameMethod = typeof CreateGameMessage.method;

export interface CreateGameParams extends GameConfiguration {
  program: SparkProgram;
}

export interface CreateGameResult {
  simulatePath: string | null;
  simulationOptions?: Record<
    string,
    {
      favoredChoices?: (number | undefined)[];
      favoredConditions?: (boolean | undefined)[];
    }
  >;
  startPath: string | null;
  saveData: SaveData;
}

export class CreateGameMessage {
  static readonly method = "game/create";
  static readonly type = new MessageProtocolRequestType<
    CreateGameMethod,
    CreateGameParams,
    CreateGameResult
  >(CreateGameMessage.method);
}

export namespace CreateGameMessage {
  export interface Request
    extends RequestMessage<
      CreateGameMethod,
      CreateGameParams,
      CreateGameResult
    > {}
  export interface Response
    extends ResponseMessage<CreateGameMethod, CreateGameResult> {}
}
