import { Create } from "../../core/types/Create";
import { Shadow } from "../types/Shadow";

export const _shadow: Create<Shadow> = () => ({
  layers: [
    {
      offsetX: 0,
      offsetY: 1,
      blur: 3,
      spread: 0,
      color: "black",
      opacity: 0.3,
    },
    {
      offsetX: 0,
      offsetY: 4,
      blur: 8,
      spread: 3,
      color: "black",
      opacity: 0.15,
    },
  ],
});
