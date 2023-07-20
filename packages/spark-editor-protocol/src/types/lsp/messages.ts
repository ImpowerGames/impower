import * as is from "./is";

/**
 * A language server message
 */
export interface Message {
  jsonrpc: string;
}

/**
 * Request message
 */
export interface RequestMessage extends Message {
  /**
   * The request id.
   */
  id: number | string | null;

  /**
   * The method to be invoked.
   */
  method: string;

  /**
   * The method's params.
   */
  params?: any[] | object;
}

/**
 * Predefined error codes.
 */
export namespace ErrorCodes {
  // Defined by JSON RPC
  export const ParseError: -32700 = -32700;
  export const InvalidRequest: -32600 = -32600;
  export const MethodNotFound: -32601 = -32601;
  export const InvalidParams: -32602 = -32602;
  export const InternalError: -32603 = -32603;

  /**
   * This is the start range of JSON RPC reserved error codes.
   * It doesn't denote a real error code. No application error codes should
   * be defined between the start and end range. For backwards
   * compatibility the `ServerNotInitialized` and the `UnknownErrorCode`
   * are left in the range.
   *
   * @since 3.16.0
   */
  export const jsonrpcReservedErrorRangeStart: -32099 = -32099;
  /** @deprecated use  jsonrpcReservedErrorRangeStart */
  export const serverErrorStart: -32099 =
    /* jsonrpcReservedErrorRangeStart */ -32099;

  /**
   * An error occurred when write a message to the transport layer.
   */
  export const MessageWriteError: -32099 = -32099;

  /**
   * An error occurred when reading a message from the transport layer.
   */
  export const MessageReadError: -32098 = -32098;

  /**
   * The connection got disposed or lost and all pending responses got
   * rejected.
   */
  export const PendingResponseRejected: -32097 = -32097;

  /**
   * The connection is inactive and a use of it failed.
   */
  export const ConnectionInactive: -32096 = -32096;

  /**
   * Error code indicating that a server received a notification or
   * request before the server has received the `initialize` request.
   */
  export const ServerNotInitialized: -32002 = -32002;
  export const UnknownErrorCode: -32001 = -32001;

  /**
   * This is the end range of JSON RPC reserved error codes.
   * It doesn't denote a real error code.
   *
   * @since 3.16.0
   */
  export const jsonrpcReservedErrorRangeEnd: -32000 = -32000;
  /** @deprecated use  jsonrpcReservedErrorRangeEnd */
  export const serverErrorEnd: -32000 =
    /* jsonrpcReservedErrorRangeEnd */ -32000;
}
type integer = number;
export type ErrorCodes = integer;

export interface ResponseErrorLiteral<D = void> {
  /**
   * A number indicating the error type that occurred.
   */
  code: number;

  /**
   * A string providing a short description of the error.
   */
  message: string;

  /**
   * A Primitive or Structured value that contains additional
   * information about the error. Can be omitted.
   */
  data?: D;
}

/**
 * An error object return in a response in case a request
 * has failed.
 */
export class ResponseError<D = void> extends Error {
  public readonly code: number;
  public readonly data: D | undefined;

  constructor(code: number, message: string, data?: D) {
    super(message);
    this.code = is.number(code) ? code : ErrorCodes.UnknownErrorCode;
    this.data = data;
    Object.setPrototypeOf(this, ResponseError.prototype);
  }

  public toJson(): ResponseErrorLiteral<D> {
    const result: ResponseErrorLiteral<D> = {
      code: this.code,
      message: this.message,
    };
    if (this.data !== undefined) {
      result.data = this.data;
    }
    return result;
  }
}

/**
 * A response message.
 */
export interface ResponseMessage extends Message {
  /**
   * The request id.
   */
  id: number | string | null;

  /**
   * The result of a request. This member is REQUIRED on success.
   * This member MUST NOT exist if there was an error invoking the method.
   */
  result?: string | number | boolean | object | any[] | null;

  /**
   * The error object in case a request fails.
   */
  error?: ResponseErrorLiteral<any>;
}

/**
 * A LSP Log Entry.
 */
export type LSPMessageType =
  | "send-request"
  | "receive-request"
  | "send-response"
  | "receive-response"
  | "send-notification"
  | "receive-notification";

export interface LSPLogMessage {
  type: LSPMessageType;
  message: RequestMessage | ResponseMessage | NotificationMessage;
  timestamp: number;
}

export class ParameterStructures {
  /**
   * The parameter structure is automatically inferred on the number of parameters
   * and the parameter type in case of a single param.
   */
  public static readonly auto = new ParameterStructures("auto");

  /**
   * Forces `byPosition` parameter structure. This is useful if you have a single
   * parameter which has a literal type.
   */
  public static readonly byPosition = new ParameterStructures("byPosition");

  /**
   * Forces `byName` parameter structure. This is only useful when having a single
   * parameter. The library will report errors if used with a different number of
   * parameters.
   */
  public static readonly byName = new ParameterStructures("byName");

  private constructor(private readonly kind: string) {}

  public static is(value: any): value is ParameterStructures {
    return (
      value === ParameterStructures.auto ||
      value === ParameterStructures.byName ||
      value === ParameterStructures.byPosition
    );
  }

  public toString(): string {
    return this.kind;
  }
}

/**
 * An interface to type messages.
 */
export interface MessageSignature {
  readonly method: string;
  readonly numberOfParams: number;
  readonly parameterStructures: ParameterStructures;
}

/**
 * An abstract implementation of a MessageType.
 */
export abstract class AbstractMessageSignature implements MessageSignature {
  public readonly method: string;
  public readonly numberOfParams: number;

  constructor(method: string, numberOfParams: number) {
    this.method = method;
    this.numberOfParams = numberOfParams;
  }

  get parameterStructures(): ParameterStructures {
    return ParameterStructures.auto;
  }
}

/**
 * End marker interface for request and notification types.
 */
export interface _EM {
  _$endMarker$_: number;
}

/**
 * Classes to type request response pairs
 */
export class RequestType0<R, E> extends AbstractMessageSignature {
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly _: [R, E, _EM] | undefined;
  constructor(method: string) {
    super(method, 0);
  }
}

export class RequestType<P, R, E> extends AbstractMessageSignature {
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly _: [P, R, E, _EM] | undefined;
  constructor(
    method: string,
    protected _parameterStructures: ParameterStructures = ParameterStructures.auto
  ) {
    super(method, 1);
  }

  override get parameterStructures(): ParameterStructures {
    return this._parameterStructures;
  }
}

/**
 * Notification Message
 */
export interface NotificationMessage extends Message {
  /**
   * The method to be invoked.
   */
  method: string;

  /**
   * The notification's params.
   */
  params?: any[] | object;
}

export class NotificationType<P> extends AbstractMessageSignature {
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly _: [P, _EM] | undefined;
  constructor(
    method: string,
    protected _parameterStructures: ParameterStructures = ParameterStructures.auto
  ) {
    super(method, 1);
  }

  override get parameterStructures(): ParameterStructures {
    return this._parameterStructures;
  }
}

export class NotificationType0 extends AbstractMessageSignature {
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly _: [_EM] | undefined;
  constructor(method: string) {
    super(method, 0);
  }
}

export namespace Message {
  /**
   * Tests if the given message is a request message
   */
  export function isRequest(
    message: Message | undefined
  ): message is RequestMessage {
    const candidate = <RequestMessage>message;
    return (
      candidate &&
      is.string(candidate.method) &&
      (is.string(candidate.id) || is.number(candidate.id))
    );
  }

  /**
   * Tests if the given message is a notification message
   */
  export function isNotification(
    message: Message | undefined
  ): message is NotificationMessage {
    const candidate = <NotificationMessage>message;
    return (
      candidate && is.string(candidate.method) && (<any>message).id === void 0
    );
  }

  /**
   * Tests if the given message is a response message
   */
  export function isResponse(
    message: Message | undefined
  ): message is ResponseMessage {
    const candidate = <ResponseMessage>message;
    return (
      candidate &&
      (candidate.result !== void 0 || !!candidate.error) &&
      (is.string(candidate.id) ||
        is.number(candidate.id) ||
        candidate.id === null)
    );
  }
}

export type ProgressToken = number | string;
export namespace ProgressToken {
  export function is(value: any): value is number | string {
    return typeof value === "string" || typeof value === "number";
  }
}
export class ProgressType<PR> {
  /**
   * Clients must not use these properties. They are here to ensure correct typing.
   * in TypeScript
   */
  public readonly __: [PR, _EM] | undefined;
  public readonly _pr: PR | undefined;

  constructor() {}
}

export enum MessageDirection {
  clientToServer = "clientToServer",
  serverToClient = "serverToClient",
  both = "both",
}

export class RegistrationType<RO> {
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly ____: [RO, _EM] | undefined;

  public readonly method: string;
  public constructor(method: string) {
    this.method = method;
  }
}

export class ProtocolRequestType0<R, PR, E, RO>
  extends RequestType0<R, E>
  implements ProgressType<PR>, RegistrationType<RO>
{
  /**
   * Clients must not use these properties. They are here to ensure correct typing.
   * in TypeScript
   */
  public readonly __: [PR, _EM] | undefined;
  public readonly ___: [PR, RO, _EM] | undefined;
  public readonly ____: [RO, _EM] | undefined;
  public readonly _pr: PR | undefined;

  public constructor(method: string) {
    super(method);
  }
}

export class ProtocolRequestType<P, R, PR, E, RO>
  extends RequestType<P, R, E>
  implements ProgressType<PR>, RegistrationType<RO>
{
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly __: [PR, _EM] | undefined;
  public readonly ___: [PR, RO, _EM] | undefined;
  public readonly ____: [RO, _EM] | undefined;
  public readonly _pr: PR | undefined;

  public constructor(method: string) {
    super(method, ParameterStructures.byName);
  }
}

export class ProtocolNotificationType0<RO>
  extends NotificationType0
  implements RegistrationType<RO>
{
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly ___: [RO, _EM] | undefined;
  public readonly ____: [RO, _EM] | undefined;

  public constructor(method: string) {
    super(method);
  }
}

export class ProtocolNotificationType<P, RO>
  extends NotificationType<P>
  implements RegistrationType<RO>
{
  /**
   * Clients must not use this property. It is here to ensure correct typing.
   */
  public readonly ___: [RO, _EM] | undefined;
  public readonly ____: [RO, _EM] | undefined;

  public constructor(method: string) {
    super(method, ParameterStructures.byName);
  }
}
