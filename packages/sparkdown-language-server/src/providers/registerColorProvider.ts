import {
  Color,
  ColorInformation,
  ColorPresentation,
  Connection,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import SparkdownTextDocuments from "../classes/SparkdownTextDocuments";

const registerColorProvider = (
  connection: Connection,
  documents: SparkdownTextDocuments
) => {
  connection.onDocumentColor((params) => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const program = documents.program(uri);
    console.log(program);
    return getColorInformation(document);
  });
  connection.onColorPresentation((params) => {
    return getColorPresentation(params.color, params.range);
  });
};

const COLOR_REGEX = /#([0-9A-Fa-f]{6})/g;

const enum CharCode {
  Digit0 = 48,
  Digit9 = 57,

  A = 65,
  F = 70,

  a = 97,
  f = 102,
}

const getColorInformation = (document: TextDocument | undefined) => {
  const result: ColorInformation[] = [];

  if (document) {
    const text = document.getText();

    COLOR_REGEX.lastIndex = 0;
    let match;
    while ((match = COLOR_REGEX.exec(text)) != null) {
      const offset = match.index;
      const length = match[0].length;
      const range = Range.create(
        document.positionAt(offset),
        document.positionAt(offset + length)
      );
      const color = parseColor(text, offset);
      result.push({ color, range });
    }
  }

  return result;
};

const getColorPresentation = (color: Color, range: Range) => {
  const result: ColorPresentation[] = [];
  const red256 = Math.round(color.red * 255),
    green256 = Math.round(color.green * 255),
    blue256 = Math.round(color.blue * 255);

  const toTwoDigitHex = (n: number): string => {
    const r = n.toString(16);
    return r.length !== 2 ? "0" + r : r;
  };

  const label = `#${toTwoDigitHex(red256)}${toTwoDigitHex(
    green256
  )}${toTwoDigitHex(blue256)}`;
  result.push({ label: label, textEdit: TextEdit.replace(range, label) });

  return result;
};

const parseHexDigit = (charCode: CharCode): number => {
  if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9) {
    return charCode - CharCode.Digit0;
  }
  if (charCode >= CharCode.A && charCode <= CharCode.F) {
    return charCode - CharCode.A + 10;
  }
  if (charCode >= CharCode.a && charCode <= CharCode.f) {
    return charCode - CharCode.a + 10;
  }
  return 0;
};

const parseColor = (content: string, offset: number): Color => {
  const r =
    (16 * parseHexDigit(content.charCodeAt(offset + 1)) +
      parseHexDigit(content.charCodeAt(offset + 2))) /
    255;
  const g =
    (16 * parseHexDigit(content.charCodeAt(offset + 3)) +
      parseHexDigit(content.charCodeAt(offset + 4))) /
    255;
  const b =
    (16 * parseHexDigit(content.charCodeAt(offset + 5)) +
      parseHexDigit(content.charCodeAt(offset + 6))) /
    255;
  return Color.create(r, g, b, 1);
};

export default registerColorProvider;
