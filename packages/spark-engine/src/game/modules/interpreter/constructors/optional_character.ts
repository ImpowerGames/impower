import { Create } from "../../../core/types/Create";

export const optional_character: Create<any> = () => ({
  $type: "character",
  $name: "$optional",
  color: { $type: "color" },
});
