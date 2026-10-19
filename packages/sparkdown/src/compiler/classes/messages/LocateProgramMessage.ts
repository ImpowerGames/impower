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

/** One question for a program's accessor (`ProgramLocator`): the address of
 *  a line, where an address stands, or both of a line at once (`beatAt`). */
export type LocateQuery =
  | { addressAt: { uri: string; line: number; query?: AddressQuery } }
  | { locationOf: ProgramAddress }
  | { beatAt: { uri: string; line: number; query?: AddressQuery } };

export interface LocateProgramParams {
  /** The uri the program was compiled for (`SparkProgram.uri`). */
  program: string;
  queries: LocateQuery[];
}

/** Each query's answer, in order: an address for `addressAt`, a location for
 *  `locationOf`, both for `beatAt`, and null where the accessor has none or
 *  the worker holds no program compiled for that uri. */
export type LocateProgramResult = (
  | ProgramAddress
  | SourceLocation
  | LineBeat
  | null
)[];

/**
 * Asks the compiler's worker the program's accessor. A program compiled with
 * statement chunks is located by its root, which stays in the worker that
 * compiled it (the transport leaves it out), so a host that holds the
 * program's copy, as the language server does, asks here
 * (docs/engine/binary-program.md, section 8). The worker answers from the
 * last program it compiled for the uri.
 */
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
