import { Create } from "../../../core/types/Create";

export const optional_color: Create<any> = () => ({
  $type: "color",
  $name: "$optional",
  value: "",
});
