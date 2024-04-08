import { DefineOptions } from "../component";
import { SpecComponentConstructor } from "../types/SpecComponentConstructor";
import define from "./define";

const defineAll = (
  constructors: readonly SpecComponentConstructor[],
  options?: DefineOptions
) => {
  if (options?.graphics) {
    constructors.forEach((constructor) => {
      Object.defineProperty(constructor.prototype, "graphics", {
        get(this: InstanceType<typeof constructor>) {
          return options?.graphics;
        },
      });
    });
  }
  return Promise.all(
    constructors.map((constructor) => define(constructor.tag!, constructor))
  );
};

export default defineAll;
