import { ConfigParameters } from "./interfaces/configParameters";

export type ConfigContextState = [
  ConfigParameters,
  () => Promise<ConfigParameters>
];
