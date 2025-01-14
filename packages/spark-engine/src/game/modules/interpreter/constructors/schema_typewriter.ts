import { Typewriter } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_typewriter: Create<Schema<Typewriter>> = () => ({
  $type: "typewriter",
  $name: "$schema",
  letter_pause: [0.01, 0, 1],
  phrase_pause_scale: [0.5, 1, 10],
  fade_duration: [0.01, 0, 1],
});
