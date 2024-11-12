import { schema_character } from "./constructors/schema_character";
import { schema_writer } from "./constructors/schema_writer";

export const interpreterSchemaDefinitions = () => ({
  writer: {
    $schema: schema_writer(),
  } as Record<string, ReturnType<typeof schema_writer>>,
  character: {
    $schema: schema_character(),
  } as Record<string, ReturnType<typeof schema_character>>,
});
