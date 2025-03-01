import { description_metadata } from "./constructors/description_metadata";

export const coreDescriptionDefinitions = () => ({
  metadata: {
    $description: description_metadata(),
  } as Record<string, ReturnType<typeof description_metadata>>,
});
