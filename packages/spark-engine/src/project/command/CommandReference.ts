export interface CommandReference<T extends string = string> {
  typeId: T | "";
  parentId: string;
  id: string;
  index: number;
}
