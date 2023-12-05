import { RecursivePartial } from "./RecursivePartial";

export type Create<T = any> = (obj?: RecursivePartial<T>) => T;
