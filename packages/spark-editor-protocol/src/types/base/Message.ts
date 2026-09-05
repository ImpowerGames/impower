export interface Message<M extends string = string> {
  jsonrpc: string;
  method: M;
}
