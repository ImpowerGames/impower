import { Create } from "../../../core/types/Create";
import { Style } from "../types/Style";

export const _style: Create<Style> = (obj) => ({
  $type: "style",
  ...obj,
});
