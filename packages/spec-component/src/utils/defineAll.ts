import { SpecComponentConstructor } from "../types/SpecComponentConstructor";
import define from "./define";

const defineAll = (constructors: readonly SpecComponentConstructor[]) => {
  return Promise.all(
    constructors.map((constructor) => define(constructor.tag, constructor))
  );
};

export default defineAll;
