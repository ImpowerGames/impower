import { Reference } from "../../../core/types/Reference";

export interface Transition
  extends Reference<"transition">,
    Record<string, string | Reference<"animation"> | any | undefined> {
  on_hide?: Reference<"animation">;
  on_show?: Reference<"animation">;
}
