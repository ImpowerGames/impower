export interface Message<M extends string = string, P extends object = any> {
  jsonrpc: string;
  method: M;
  params?: P;
}
