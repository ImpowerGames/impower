import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";
import { GameConfiguration } from "../../types/GameConfiguration";
import { SaveData } from "../../types/SaveData";

export type CreateGameMethod = typeof CreateGameMessage.method;

export interface CreateGameParams extends GameConfiguration {
  program: SparkProgram;
}

export interface CreateGameResult {
  simulatePath: string | null;
  simulateChoices: Record<string, number[]> | null;
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
