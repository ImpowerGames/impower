import { RecursivePartial } from "../../../../../spark-evaluate/src/types/RecursivePartial";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const augment = <T>(obj: T, preset: RecursivePartial<T>): void => {
  traverse(preset, (path, v) => {
    if (v !== undefined) {
      setProperty(obj, path, v);
    }
  });
};
