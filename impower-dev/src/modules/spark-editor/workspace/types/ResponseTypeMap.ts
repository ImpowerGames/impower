export interface ResponseTypeMap
  extends Record<XMLHttpRequestResponseType, any> {
  arraybuffer: ArrayBuffer;
  blob: Blob;
  document: Document;
  json: object;
  text: string;
}
