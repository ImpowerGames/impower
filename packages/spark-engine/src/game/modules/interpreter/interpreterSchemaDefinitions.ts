import { schema_character } from "./constructors/schema_character";
import { schema_typewriter } from "./constructors/schema_typewriter";

export const interpreterSchemaDefinitions = () => ({
  typewriter: {
    $schema: schema_typewriter(),
  } as Record<string, ReturnType<typeof schema_typewriter>>,
  character: {
    $schema: schema_character(),
  } as Record<string, ReturnType<typeof schema_character>>,
});
