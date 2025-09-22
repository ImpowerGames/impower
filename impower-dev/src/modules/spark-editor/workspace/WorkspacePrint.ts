import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import {
  ExportPDFMessage,
  ExportPDFParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ExportPDFMessage";
import { ProgressValue } from "@impower/spark-editor-protocol/src/types/base/ProgressValue";
import ScreenplayParser from "../../../../../packages/sparkdown-screenplay/src/classes/ScreenplayParser";
import { ScreenplayConfig } from "../../../../../packages/sparkdown-screenplay/src/types/ScreenplayConfig";
import { generateScreenplayHtmlData } from "../../../../../packages/sparkdown-screenplay/src/utils/generateScreenplayHtmlData";

export default class WorkspacePrint {
  protected _worker: Worker;

  protected _messageQueue: Record<
    string,
    { resolve: (result: any) => void; reject: (err: any) => void }
  > = {};

  protected _progressQueue: Record<string, (value: ProgressValue) => void> = {};

  protected _config: ScreenplayConfig = {
    screenplay_print_title_page: true,
    screenplay_print_bookmarks_for_invisible_headings: true,
    screenplay_print_dialogue_split_across_pages: true,
    screenplay_print_page_numbers: true,
    screenplay_print_headings_bold: true,
    screenplay_print_scene_numbers: "left",
  };
  get config() {
    return this._config;
  }

  constructor() {
    this._worker = new Worker("/sparkdown-screenplay-pdf.js");
    this._worker.onerror = (e) => {
      console.error(e);
    };
    this._worker.addEventListener("message", this.handleWorkerMessage);
  }

  protected async getFonts() {
    const normalResp = await fetch("/fonts/courier-prime.ttf", {
      cache: "force-cache",
    });
    const normal = await normalResp.arrayBuffer();
    const boldResp = await fetch("/fonts/courier-prime-bold.ttf", {
      cache: "force-cache",
    });
    const bold = await boldResp.arrayBuffer();
    const italicResp = await fetch("/fonts/courier-prime-italic.ttf", {
      cache: "force-cache",
    });
    const italic = await italicResp.arrayBuffer();
    const boldItalicResp = await fetch("/fonts/courier-prime-bold-italic.ttf", {
      cache: "force-cache",
    });
    const bolditalic = await boldItalicResp.arrayBuffer();
    return {
      normal,
      bold,
      italic,
      bolditalic,
    };
  }

  protected handleWorkerMessage = async (event: MessageEvent) => {
    const message = event.data;
    if (
      typeof message.method === "string" &&
      message.method.endsWith("/progress") &&
      typeof message.params?.token === "string"
    ) {
      const progressCallback = this._progressQueue[message.params.token];
      if (message.params.value) {
        progressCallback?.(message.params.value);
      }
    } else if (message.error) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.reject(message.error);
        delete this._messageQueue[message.id];
      }
    } else if (message.result !== undefined) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.resolve(message.result);
        delete this._messageQueue[message.id];
      }
    }
  };

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = []
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const request = type.request(params);
      this._messageQueue[request.id] = { resolve, reject };
      if (type.method === "workspace/exportPDF") {
        this._worker.postMessage(request, transfer);
      }
    });
  }

  async exportPDF(
    scripts: string[],
    onProgress?: (value: ProgressValue) => void
  ) {
    const fonts = await this.getFonts();
    const params: ExportPDFParams = { scripts, fonts, config: this.config };
    if (onProgress) {
      params.workDoneToken = ExportPDFMessage.type.uuid();
      this._progressQueue[params.workDoneToken] = onProgress;
    }
    return this.sendRequest(ExportPDFMessage.type, params, [
      params.fonts.normal,
      params.fonts.bold,
      params.fonts.italic,
      params.fonts.bolditalic,
    ]);
  }

  async exportHTML(
    scripts: string[],
    onProgress?: (value: ProgressValue) => void
  ) {
    const fonts = await this.getFonts();
    const parser = new ScreenplayParser();
    const tokens = parser.parseAll(scripts);
    return generateScreenplayHtmlData(tokens, this.config, fonts);
  }
}
