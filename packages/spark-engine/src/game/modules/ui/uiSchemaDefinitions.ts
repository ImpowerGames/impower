import { schema_ease } from "./constructors/schema_ease";
import { schema_font } from "./constructors/schema_font";
import { schema_ui } from "./constructors/schema_ui";
import { schema_style } from "./constructors/schema_style";
import { schema_shadow } from "./constructors/schema_shadow";
import { schema_filtered_image } from "./constructors/schema_filtered_image";
import { schema_graphic } from "./constructors/schema_graphic";
import { schema_gradient } from "./constructors/schema_gradient";

export const uiSchemaDefinitions = () => ({
  ease: {
    $schema: schema_ease(),
  } as Record<string, ReturnType<typeof schema_ease>>,
  font: {
    $schema: schema_font(),
  } as Record<string, ReturnType<typeof schema_font>>,
  ui: {
    $schema: schema_ui(),
  } as Record<string, ReturnType<typeof schema_ui>>,
  style: {
    $schema: schema_style(),
  } as Record<string, ReturnType<typeof schema_style>>,
  shadow: {
    $schema: schema_shadow(),
  } as Record<string, ReturnType<typeof schema_shadow>>,
  filtered_image: {
    $schema: schema_filtered_image(),
  } as Record<string, ReturnType<typeof schema_filtered_image>>,
  graphic: {
    $schema: schema_graphic(),
  } as Record<string, ReturnType<typeof schema_graphic>>,
  gradient: {
    $schema: schema_gradient(),
  } as Record<string, ReturnType<typeof schema_gradient>>,
});
