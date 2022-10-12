import * as PIXI from "pixi.js";

export const registerPixiInspector = (): void => {
  const w = window as unknown as {
    __PIXI_INSPECTOR_GLOBAL_HOOK__: {
      register: (arg: { PIXI: typeof PIXI }) => void;
    };
  };
  if (w.__PIXI_INSPECTOR_GLOBAL_HOOK__) {
    w.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI });
  }
};
