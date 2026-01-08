import { Story } from "../../inkjs/engine/Story";

export interface SparkdownCompilerState {
  contextPropertyRegistry?: {
    [type: string]: {
      [name: string]: {
        [propertyPath: string]: any;
      };
    };
  };
  defaultDefinitions?: { [type: string]: any };
  story?: Story;
}
