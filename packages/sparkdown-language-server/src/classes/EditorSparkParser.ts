import { compile, format } from "../../../spark-evaluate/src/index";
import { SparkParser } from "../../../sparkdown/src/classes/SparkParser";
import { SparkParserConfig } from "../../../sparkdown/src/types/SparkParserConfig";

export class EditorSparkParser extends SparkParser {
  private static _instance: EditorSparkParser;

  public static get instance(): EditorSparkParser {
    if (!this._instance) {
      this._instance = new EditorSparkParser();
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
