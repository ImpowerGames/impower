import { Reference } from "../../../core/types/Reference";

export interface Character extends Reference<"character"> {
  name: string;
  color: string;
}
