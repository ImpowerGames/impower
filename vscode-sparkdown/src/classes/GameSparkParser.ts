import { compile, format } from "@impower/spark-evaluate/src/index";
import SparkParser from "@impower/sparkdown/src/classes/SparkParser";
import { SparkParserConfig } from "@impower/sparkdown/src/index";

export class GameSparkParser extends SparkParser {
  private static _instance: GameSparkParser;

  public static get instance(): GameSparkParser {
    if (!this._instance) {
      this._instance = new GameSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super(
      config || {
        compiler: compile,
        formatter: format,
      }
    );
  }
}
