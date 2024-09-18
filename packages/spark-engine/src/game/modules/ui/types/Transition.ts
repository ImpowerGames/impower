import { Reference } from "../../../core/types/Reference";
import { Animation } from "./Animation";

export interface Transition
  extends Reference<"transition">,
    Record<string, string | Animation | undefined> {
  on_exit?: string | Animation;
  on_enter?: string | Animation;
}
