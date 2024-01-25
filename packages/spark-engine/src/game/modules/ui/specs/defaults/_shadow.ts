import { Create } from "../../../../core/types/Create";
import { Shadow } from "../Shadow";

export const _shadow: Create<Shadow> = () => ({
  layers: [
    {
      x: 0,
      y: 1,
      blur: 3,
      spread: 0,
      color: "black",
      opacity: 0.3,
    },
    {
      x: 0,
      y: 4,
      blur: 8,
      spread: 3,
      color: "black",
      opacity: 0.15,
    },
  ],
});
