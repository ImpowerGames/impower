import { defaultDisplayScript } from "../defaults/defaultDisplayScript";
import { SparkDeclarations } from "../types/SparkDeclarations";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkParseResult } from "../types/SparkParseResult";
import { parseSpark } from "../utils/parseSpark";

export class SparkParser {
  defaults: string[] = [defaultDisplayScript];

  config: SparkParserConfig = {};

  private _defaultAugmentations: SparkDeclarations = {};

  constructor(config: SparkParserConfig, defaults?: string[]) {
    this.config = config || this.config;
    this.defaults = defaults || this.defaults;
    this.defaults.forEach((d) => {
      const parsed = parseSpark(d, this.config);
      this._defaultAugmentations = {
        variables: {
          ...(this._defaultAugmentations?.variables || {}),
          ...(parsed.variables || {}),
        },
        structs: {
          ...(this._defaultAugmentations?.structs || {}),
          ...(parsed.structs || {}),
        },
      };
    });
  }

  parse(script: string, config?: SparkParserConfig): SparkParseResult {
    const augmentations = {
      variables: {
        ...(this._defaultAugmentations?.variables || {}),
        ...(config?.augmentations?.variables || {}),
      },
    };
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
      augmentations,
    });
    result.structs = {
      ...(this._defaultAugmentations?.structs || {}),
      ...(result.structs || {}),
    };
    return result;
  }
}
