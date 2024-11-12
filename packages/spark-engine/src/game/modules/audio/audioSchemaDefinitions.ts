import { schema_synth } from "./constructors/schema_synth";

export const audioSchemaDefinitions = () => ({
  synth: {
    $schema: schema_synth(),
  } as Record<string, ReturnType<typeof schema_synth>>,
});
