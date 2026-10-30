export interface IBufferCursor {
  pos: number;
  id: number;
  start: number;
  end: number;
  size: number;
  next(): void;
  fork(): IBufferCursor;
}
