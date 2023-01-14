import { Create } from "../../core/types/Create";
import { Pattern } from "../types/Pattern";

export const _pattern: Create<Pattern> = () => ({
  weight: 1,
  zoom: 1,
  angle: 0,
  colors: ["#44337A", "#FFC800", "#FFFFFF", "#FF0054", "#00A878"],
  graphic: {
    width: 20,
    height: 80,
    paths: [
      "M -5 5 l 10 10 l 10 -10 l 10 10",
      "M -5 25 l 10 10 l 10 -10 l 10 10",
      "M -5 45 l 10 10 l 10 -10 l 10 10",
      "M -5 65 l 10 10 l 10 -10 l 10 10",
    ],
  },
});
