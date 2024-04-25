import { RecursivePartial } from "./RecursivePartial";

export type Create<T = any> = (
  obj: RecursivePartial<T> & { $type?: string; $name: string }
) => T & { $type: string; $name: string };
