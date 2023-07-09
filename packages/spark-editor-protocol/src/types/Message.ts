export interface Message<M extends string = string, P extends object = any> {
  method: M;
  params: P;
}
