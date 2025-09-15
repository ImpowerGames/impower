export interface Message<M extends string = string, P = any> {
  jsonrpc: string;
  method: M;
}
