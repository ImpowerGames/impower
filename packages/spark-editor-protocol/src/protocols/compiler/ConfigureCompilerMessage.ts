import { SparkdownCompilerConfig } from "../../../../sparkdown/src/types/SparkdownCompilerConfig";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigureCompilerMethod = typeof ConfigureCompilerMessage.method;

export interface ConfigureCompilerParams extends SparkdownCompilerConfig {}

export type ConfigureCompilerResult = string;

export class ConfigureCompilerMessage {
  static readonly method = "compiler/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigureCompilerMethod,
    ConfigureCompilerParams,
    ConfigureCompilerResult
  >(ConfigureCompilerMessage.method);
}

export namespace ConfigureCompilerMessage {
  export interface Request
    extends RequestMessage<
      ConfigureCompilerMethod,
      ConfigureCompilerParams,
      ConfigureCompilerResult
    > {}
  export interface Response
    extends ResponseMessage<ConfigureCompilerMethod, ConfigureCompilerResult> {}
}
