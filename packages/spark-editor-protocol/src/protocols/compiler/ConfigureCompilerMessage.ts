import { SparkdownCompilerConfig } from "../../../../sparkdown/src/types/SparkdownCompilerConfig";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureCompilerMethod = typeof ConfigureCompilerMessage.method;

export interface ConfigureCompilerParams extends SparkdownCompilerConfig {}

export class ConfigureCompilerMessage {
  static readonly method = "compiler/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureCompilerMethod,
    ConfigureCompilerParams,
    string
  >(ConfigureCompilerMessage.method);
}
