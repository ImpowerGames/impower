import { Ease } from "../../enums/ease";
import { createDynamicData, DynamicData } from "../generics/dynamicData";

export interface TransitionConfig {
  duration?: DynamicData<number>;
  ease?: DynamicData<Ease>;
}

export const isTransitionConfig = (obj: unknown): obj is TransitionConfig => {
  if (!obj) {
    return false;
  }
  const transitionConfig = obj as TransitionConfig;
  return (
    transitionConfig.duration !== undefined &&
    transitionConfig.ease !== undefined
  );
};

export const createTransitionConfig = (
  obj?: Partial<TransitionConfig>
): TransitionConfig => ({
  duration: createDynamicData(0),
  ease: createDynamicData(Ease.QuadInOut),
  ...obj,
});
