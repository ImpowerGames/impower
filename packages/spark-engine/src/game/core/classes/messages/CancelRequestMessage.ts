import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

interface P {
  id: number | string;
}

export type CancelRequestMethod<T extends string> = `${T}/cancelRequest`;

export class CancelRequestMessage {
  static readonly method = <T extends string>(m: T): CancelRequestMethod<T> =>
    `${m}/cancelRequest`;
  static readonly type = <T extends string>(m: T) =>
    new MessageProtocolNotificationType<CancelRequestMethod<T>, P>(
      CancelRequestMessage.method(m)
    );
}
