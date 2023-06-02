import { compile, format } from "../../../spark-evaluate";
import { SparkParser, SparkParserConfig } from "../../../sparkdown";

export class ScreenplaySparkParser extends SparkParser {
  private static _instance: ScreenplaySparkParser;

  public static get instance(): ScreenplaySparkParser {
    if (!this._instance) {
      this._instance = new ScreenplaySparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig, defaults?: string[]) {
    super(
      config || {
        compiler: compile,
        formatter: format,
        removeBlockComments: true,
        skipTokens: ["condition"],
      },
      defaults
    );
  }
}
