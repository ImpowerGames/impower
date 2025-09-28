import { Reference } from "../../../core/types/Reference";

export interface Channel extends Reference<"channel"> {
  mixer?: string | Reference<"mixer">;
  loop: boolean;
  play_behavior: "stack" | "replace";
}
