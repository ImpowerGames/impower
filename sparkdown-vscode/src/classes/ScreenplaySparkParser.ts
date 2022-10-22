import { compile, format } from "../../../spark-evaluate";
import {
  defaultDisplayScript,
  parseSpark,
  SparkDeclarations,
  SparkParserConfig,
  SparkParseResult,
} from "../../../sparkdown";

export class ScreenplaySparkParser {
  private static _instance: ScreenplaySparkParser;

  public static get instance(): ScreenplaySparkParser {
    if (!this._instance) {
      this._instance = new ScreenplaySparkParser();
    }
    return this._instance;
  }

  defaults: string[] = [defaultDisplayScript];

  config: SparkParserConfig = {
    compiler: compile,
    formatter: format,
    removeBlockComments: true,
    skipTokens: ["condition"],
  };

  constructor(defaults?: string[], config?: SparkParserConfig) {
    this.defaults = defaults || this.defaults;
    this.config = config || this.config;
  }

  parse(script: string, config?: SparkParserConfig): SparkParseResult {
    let augmentations: SparkDeclarations = {
      ...(this.config?.augmentations || {}),
      ...(config?.augmentations || {}),
    };
    this.defaults.forEach((d) => {
      const parsed = parseSpark(d, {
        ...(this.config || {}),
        ...(config || {}),
        augmentations,
      });
      augmentations = {
        ...augmentations,
        variables: {
          ...(augmentations?.variables || {}),
          ...(parsed.variables || {}),
        },
        structs: {
          ...(augmentations?.structs || {}),
          ...(parsed.structs || {}),
        },
      };
    });
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
      augmentations,
    });
    return result;
  }
}
