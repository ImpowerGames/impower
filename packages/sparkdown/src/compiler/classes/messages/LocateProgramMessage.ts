import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type {
  AddressQuery,
  LineBeat,
  ProgramAddress,
  SourceLocation,
} from "../../types/ProgramAddress";

export type LocateProgramMethod = typeof LocateProgramMessage.method;

export type LocateQuery =
  | { addressAt: { uri: string; line: number; query?: AddressQuery } }
  | { locationOf: ProgramAddress }
  | { beatAt: { uri: string; line: number; query?: AddressQuery } };

export interface LocateProgramParams {
  program: string;
  queries: LocateQuery[];
}

export type LocateProgramResult = (
  | ProgramAddress
  | SourceLocation
  | LineBeat
  | null
)[];

export class LocateProgramMessage {
  static readonly method = "compiler/locate";
  static readonly type = new MessageProtocolRequestType<
    LocateProgramMethod,
    LocateProgramParams,
    LocateProgramResult
  >(LocateProgramMessage.method);
}

export namespace LocateProgramMessage {
  export interface Request extends RequestMessage<
    LocateProgramMethod,
    LocateProgramParams,
    LocateProgramResult
  > {}
  export type Response = ResponseMessage<
    LocateProgramMethod,
    LocateProgramResult
  >;
}
