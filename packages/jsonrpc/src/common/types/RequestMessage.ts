export interface RequestMessage<
  M extends string = string,
  P = unknown,
  R = unknown,
> {
  jsonrpc: string;
  method: M;
  params: P;

  id: number | string;

  _result?: R;
}
