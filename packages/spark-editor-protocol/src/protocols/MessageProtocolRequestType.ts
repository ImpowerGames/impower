import { MessageProtocolRequestType as CoreRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export class MessageProtocolRequestType<
  M extends string,
  P,
  R,
> extends CoreRequestType<M, P, R> {
  override uuid() {
    return crypto.randomUUID();
  }
}
