import { RuntimeObject } from "../classes/RuntimeObject";
import { IValue } from "../types/IValue";
import { createValue } from "./createValue";

export const copyValue = (val: IValue): RuntimeObject => {
  return createValue(val) as unknown as RuntimeObject;
};
