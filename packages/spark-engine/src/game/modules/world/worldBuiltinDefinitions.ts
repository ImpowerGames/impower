import { default_camera } from "./constructors/default_camera";
import { default_entity } from "./constructors/default_entity";

export const worldBuiltins = () => ({
  camera: {
    $default: default_camera({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof default_camera>>,
  entity: {
    $default: default_entity({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof default_entity>>,
});

export interface WorldBuiltins extends ReturnType<typeof worldBuiltins> {}
