import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { parseSpark } from "../utils/parseSpark";

export class SparkParser {
  config: SparkParserConfig = {};

  constructor(config: SparkParserConfig) {
    this.config = config || this.config;
  }

  parse(script: string, config?: SparkParserConfig): SparkProgram {
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
    });
    return result;
  }
}
