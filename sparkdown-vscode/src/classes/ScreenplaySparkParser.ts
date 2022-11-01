import { compile, format } from "../../../spark-evaluate";
import {
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

  config: SparkParserConfig = {
    compiler: compile,
    formatter: format,
    removeBlockComments: true,
    skipTokens: ["condition"],
  };

  constructor(config?: SparkParserConfig) {
    this.config = config || this.config;
  }

  parse(script: string, config?: SparkParserConfig): SparkParseResult {
    const augmentations: SparkDeclarations = {
      ...(this.config?.augmentations || {}),
      ...(config?.augmentations || {}),
    };
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
      augmentations,
    });
    return result;
  }
}
