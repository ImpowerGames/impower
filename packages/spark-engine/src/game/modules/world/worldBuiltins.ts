import { _camera } from "./constructors/_camera";
import { _entity } from "./constructors/_entity";

export const worldBuiltins = () => ({
  camera: {
    $default: _camera({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof _camera>>,
  entity: {
    $default: _entity({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof _entity>>,
});

export type WorldBuiltins = ReturnType<typeof worldBuiltins>;
