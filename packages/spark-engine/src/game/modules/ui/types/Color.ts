import { Reference } from "../../../core/types/Reference";

export interface Color extends Reference<"color"> {
  value?: string;
  light?: string;
  dark?: string;
}
