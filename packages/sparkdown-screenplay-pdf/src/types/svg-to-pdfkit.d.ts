declare module "svg-to-pdfkit" {
  interface SVGtoPDFOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    useCSS?: boolean;
    fontCallback?: (...args: unknown[]) => unknown;
    imageCallback?: (...args: unknown[]) => unknown;
    colorCallback?: (...args: unknown[]) => unknown;
    documentCallback?: (...args: unknown[]) => unknown;
    precision?: number;
    assumePt?: boolean;
  }
  export default function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: SVGtoPDFOptions,
  ): void;
}
