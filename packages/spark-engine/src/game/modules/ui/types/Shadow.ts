import { Reference } from "../../../core/types/Reference";

export interface Shadow extends Reference<"shadow"> {
  layers: {
    x?: number;
    y?: number;
    blur?: number;
    spread?: number;
    color?: string;
    opacity?: number;
  }[];
}
