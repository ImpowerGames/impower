import { RgbaColor, colord } from "colord";
import {
  Color,
  ColorInformation,
  ColorPresentation,
  Connection,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import SparkdownTextDocuments from "../classes/SparkdownTextDocuments";

const registerColorProvider = (
  connection: Connection,
  documents: SparkdownTextDocuments
) => {
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    return getColorInformation(document, program);
  });
  connection.onColorPresentation((params) => {
    return getColorPresentation(params.color);
  });
};

const getColorInformation = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
) => {
  const infos: ColorInformation[] = [];
  if (document && program) {
    const colors = program.metadata.colors;
    if (colors) {
      colors.forEach((c) => {
        const range = Range.create(
          document.positionAt(c.from),
          document.positionAt(c.to)
        );
        const rgb = colord(c.value).toRgb();
        const color = Color.create(
          rgb.r / 255,
          rgb.g / 255,
          rgb.b / 255,
          rgb.a
        );
        infos.push({ color, range });
      });
    }
  }
  return infos;
};

const getColorPresentation = (color: Color) => {
  const presentations: ColorPresentation[] = [];
  const rgba: RgbaColor = {
    r: color.red * 255,
    g: color.green * 255,
    b: color.blue * 255,
    a: color.alpha,
  };
  const c = colord(rgba);
  const hex = c.toHex();
  const rbga = c.toRgb();
  const hsla = c.toHsl();
  const hexLabel = hex.toUpperCase();
  const rgbLabel =
    rbga.a < 1
      ? `rgb(${rbga.r} ${rbga.g} ${rbga.b} / ${rgba.a * 100}%)`
      : `rgb(${rbga.r} ${rbga.g} ${rbga.b})`;
  const hslLabel =
    hsla.a < 1
      ? `hsl(${hsla.h} ${hsla.s}% ${hsla.l}% / ${hsla.a * 100}%)`
      : `hsl(${hsla.h} ${hsla.s}% ${hsla.l}%)`;
  presentations.push({ label: hexLabel });
  presentations.push({ label: rgbLabel });
  presentations.push({ label: hslLabel });
  return presentations;
};

export default registerColorProvider;
