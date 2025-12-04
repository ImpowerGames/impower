import { Reference } from "../../../core/types/Reference";

export interface Ease extends Reference<"ease"> {
  function: string;
  parameters: (string | number)[];
}
