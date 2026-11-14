import { type Reference } from "../../../core/types/Reference";
import { type Color } from "../../ui/types/Color";

export interface Character extends Reference<"character"> {
  name: string;
  aliases?: string[];
  color?: Color;
}
