export interface NotificationMessage<M extends string = string, P = unknown> {
  /**
   * The message's jsonrpc version.
   */
  jsonrpc: string;
  /**
   * The message's method.
   */
  method: M;
  /**
   * The notification's params.
   */
  params: P;
}
