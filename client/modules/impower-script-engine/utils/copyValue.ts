import { ImpowerObject } from "../classes/ImpowerObject";
import { IValue } from "../types/IValue";
import { createValue } from "./createValue";

export const copyValue = (val: IValue): ImpowerObject => {
  return createValue(val) as unknown as ImpowerObject;
};
