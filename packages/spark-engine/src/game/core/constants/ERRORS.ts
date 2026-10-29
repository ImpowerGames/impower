export namespace ErrorCodes {
  export const ParseError = -32700;
  export const InvalidRequest = -32600;
  export const MethodNotFound = -32601;
  export const InvalidParams = -32602;
  export const InternalError = -32603;
  export const jsonrpcReservedErrorRangeStart = -32099;
  export const serverErrorStart = -32099;
  export const MessageWriteError = -32099;
  export const MessageReadError = -32098;
  export const PendingResponseRejected = -32097;
  export const ConnectionInactive = -32096;
  export const ServerNotInitialized = -32002;
  export const UnknownErrorCode = -32001;
  export const jsonrpcReservedErrorRangeEnd = -32000;
  export const serverErrorEnd = -32000;
}
