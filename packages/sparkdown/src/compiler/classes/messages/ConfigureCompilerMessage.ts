import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { SparkdownCompilerConfig } from "../../types/SparkdownCompilerConfig";

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
  export interface Request extends RequestMessage<
    ConfigureCompilerMethod,
    ConfigureCompilerParams,
    ConfigureCompilerResult
  > {}
  export interface Response extends ResponseMessage<
    ConfigureCompilerMethod,
    ConfigureCompilerResult
  > {}
}
