import type { Message } from "../types/base/Message";

export class MessageProtocol {
  static readonly event = "jsonrpc";
}

export const sendProtocolMessage = (
  message: Message,
  target: EventTarget = window,
): boolean =>
  target.dispatchEvent(
    new CustomEvent(MessageProtocol.event, {
      detail: message,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );

export const onProtocolMessage = <M>(
  type: { is: (value: any) => value is M },
  handler: (message: M) => void,
  target: EventTarget = window,
): (() => void) => {
  const listener = (e: Event) => {
    if (e instanceof CustomEvent && e.detail != null && type.is(e.detail)) {
      handler(e.detail);
    }
  };
  target.addEventListener(MessageProtocol.event, listener);
  return () => target.removeEventListener(MessageProtocol.event, listener);
};

export const onProtocolRequest = <Req, Res>(
  type: {
    is: (value: any) => value is Req;
    response: (...args: any[]) => Res;
  },
  handler: (message: Req) => Res | undefined | Promise<Res | undefined>,
  responseTarget: EventTarget = window,
): (() => void) => {
  const listener = (e: Event) => {
    if (e instanceof CustomEvent && e.detail != null && type.is(e.detail)) {
      void Promise.resolve(handler(e.detail)).then((response) => {
        if (response != null) {
          sendProtocolMessage(response as unknown as Message, responseTarget);
        }
      });
    }
  };
  window.addEventListener(MessageProtocol.event, listener);
  return () => window.removeEventListener(MessageProtocol.event, listener);
};

export class ProtocolObserver {
  protected _disposers: (() => void)[] = [];

  constructor(
    protected wrap: (
      handler: (message: any) => any,
    ) => (message: any) => any = (handler) => handler,
  ) {}

  onNotification<M>(
    type: { is: (value: any) => value is M; response?: never },
    handler: (message: M) => void | Promise<void>,
    target: EventTarget = window,
  ): this {
    this._disposers.push(onProtocolMessage(type, this.wrap(handler), target));
    return this;
  }

  onRequest<Req, Res>(
    type: {
      is: (value: any) => value is Req;
      response: (...args: any[]) => Res;
    },
    handler: (message: Req) => Res | undefined | Promise<Res | undefined>,
    responseTarget: EventTarget = window,
  ): this {
    this._disposers.push(
      onProtocolRequest(type, this.wrap(handler), responseTarget),
    );
    return this;
  }

  dispose(): void {
    this._disposers.forEach((d) => d());
    this._disposers = [];
  }
}
