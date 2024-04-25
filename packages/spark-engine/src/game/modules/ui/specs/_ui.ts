import { Create } from "../../../core/types/Create";

export const _ui: Create<any> = (obj) => ({
  $type: "ui",
  ...obj,
});
