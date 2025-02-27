import { Reference } from "../../../core/types/Reference";

export interface Image extends Reference<"image"> {
  src: string;
  data?: string;
}
