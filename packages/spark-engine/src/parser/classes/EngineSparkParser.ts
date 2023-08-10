import { compile, format } from "../../../../spark-evaluate/src";
import { SparkParserConfig } from "../../../../sparkdown/src";
import SparkParser from "../../../../sparkdown/src/classes/SparkParser";
import { processBeatmap } from "../../game/rhythm";

export default class EngineSparkParser extends SparkParser {
  private static _instance: EngineSparkParser;

  public static get instance(): EngineSparkParser {
    if (!this._instance) {
      this._instance = new EngineSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super({
      compiler: compile,
      formatter: format,
      extensions: [processBeatmap],
      ...(config || {}),
    });
  }
}
