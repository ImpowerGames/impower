import { optional_character } from "./constructors/optional_character";

export const interpreterOptionalDefinitions = () => ({
  character: {
    $optional: optional_character(),
  } as Record<string, ReturnType<typeof optional_character>>,
});
