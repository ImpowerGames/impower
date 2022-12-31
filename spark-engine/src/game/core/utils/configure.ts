import { deepCopy } from "./deepCopy";
import { setProperty } from "./setProperty";

export const configure = <T extends object>(
  defaultObj: T,
  objectMap: { [type: string]: Record<string, object> },
  type: string,
  ...names: string[]
): T => {
  const customConfig: any = {};
  ["default", ...names].forEach((name) => {
    const c = objectMap?.[type]?.[name];
    if (c) {
      Object.entries(c).forEach(([k, v]) => {
        customConfig[k] = v;
      });
    }
  });
  const combinedConfig = defaultObj ? deepCopy(defaultObj) : {};
  Object.entries(customConfig).forEach(([k, v]) => {
    setProperty(combinedConfig, k, v);
  });
  return combinedConfig as T;
};
