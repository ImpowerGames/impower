import { MessageProtocolRequestType as CoreRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

/** Preserve editor UUIDs while inheriting all message construction and guards. */
export class MessageProtocolRequestType<
  M extends string,
  P,
  R,
> extends CoreRequestType<M, P, R> {
  override uuid() {
    return crypto.randomUUID();
  }
}
