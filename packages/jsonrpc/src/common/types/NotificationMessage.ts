export interface NotificationMessage<M extends string = string, P = unknown> {
  jsonrpc: string;
  method: M;
  params: P;
}
