import { Reference } from "../../../core/types/Reference";

export interface Channel extends Reference<"channel"> {
  mixer?: string;
  loop: boolean;
}
