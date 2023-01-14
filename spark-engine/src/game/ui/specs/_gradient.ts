import { Create } from "../../core/types/Create";
import { Gradient } from "../types/Gradient";

export const _gradient: Create<Gradient> = () => ({
  type: "linear",
  angle: 180,
  stops: [
    {
      color: "white",
      opacity: 1,
      position: 0.5,
    },
    {
      color: "white",
      opacity: 0,
      position: 1,
    },
  ],
});
