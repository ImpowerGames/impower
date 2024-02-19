export interface IMessage<M extends string = string> {
  jsonrpc: string;
  method: M;
}
