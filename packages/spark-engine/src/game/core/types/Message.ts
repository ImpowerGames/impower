export interface Message<M extends string = string, P = any> {
  method: M;
  params?: P;
}
