import { optional_style } from "./constructors/optional_style";
import { optional_animation } from "./constructors/optional_animation";

export const uiOptionalDefinitions = () => ({
  style: {
    $optional: optional_style(),
  } as Record<string, ReturnType<typeof optional_style>>,
  animation: {
    $optional: optional_animation(),
  } as Record<string, ReturnType<typeof optional_animation>>,
});
