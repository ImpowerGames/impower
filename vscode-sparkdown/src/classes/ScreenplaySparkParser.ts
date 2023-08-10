import { compile, format } from "@impower/spark-evaluate/src/index";
import SparkParser from "@impower/sparkdown/src/classes/SparkParser";
import { SparkParserConfig } from "@impower/sparkdown/src/index";

export class ScreenplaySparkParser extends SparkParser {
  private static _instance: ScreenplaySparkParser;

  public static get instance(): ScreenplaySparkParser {
    if (!this._instance) {
      this._instance = new ScreenplaySparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super(
      config || {
        compiler: compile,
        formatter: format,
        skipTokens: ["condition"],
      }
    );
  }
}
