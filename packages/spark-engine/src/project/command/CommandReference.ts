export interface CommandReference<T extends string = string> {
  type: "Command";
  typeId: T | "";
  parentId: string;
  id: string;
}
