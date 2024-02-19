export namespace ErrorCodes {
  export const ParseError = -32700;
  export const InvalidRequest = -32600;
  export const MethodNotFound = -32601;
  export const InvalidParams = -32602;
  export const InternalError = -32603;
  /**
   * This is the start range of JSON RPC reserved error codes.
   * It doesn't denote a real error code. No application error codes should
   * be defined between the start and end range. For backwards
   * compatibility the `ServerNotInitialized` and the `UnknownErrorCode`
   * are left in the range.
   *
   * @since 3.16.0
   */
  export const jsonrpcReservedErrorRangeStart = -32099;
  /** @deprecated use  jsonrpcReservedErrorRangeStart */
  export const serverErrorStart = -32099;
  /**
   * An error occurred when write a message to the transport layer.
   */
  export const MessageWriteError = -32099;
  /**
   * An error occurred when reading a message from the transport layer.
   */
  export const MessageReadError = -32098;
  /**
   * The connection got disposed or lost and all pending responses got
   * rejected.
   */
  export const PendingResponseRejected = -32097;
  /**
   * The connection is inactive and a use of it failed.
   */
  export const ConnectionInactive = -32096;
  /**
   * Error code indicating that a server received a notification or
   * request before the server has received the `initialize` request.
   */
  export const ServerNotInitialized = -32002;
  export const UnknownErrorCode = -32001;
  /**
   * This is the end range of JSON RPC reserved error codes.
   * It doesn't denote a real error code.
   *
   * @since 3.16.0
   */
  export const jsonrpcReservedErrorRangeEnd = -32000;
  /** @deprecated use  jsonrpcReservedErrorRangeEnd */
  export const serverErrorEnd = -32000;
}
