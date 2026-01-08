import { Character } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_character: Create<Schema<Character>> = () => ({
  $type: "character",
  $name: "$schema",
});
