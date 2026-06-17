import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { buildPDF } from "../buildPDF";

const usage = () => {
  console.error(
    "Usage: sparkdown-pdf <input.sd> <output.pdf> [--fonts-dir <dir>]",
  );
  console.error(
    "  --fonts-dir defaults to a sibling 'fonts' folder next to the CLI binary,",
  );
  console.error(
    "  falling back to the Courier Prime fonts under impower-dev/src/public/fonts.",
  );
  process.exit(1);
};

const args = process.argv.slice(2);
let inputArg: string | undefined;
let outputArg: string | undefined;
let fontsDirArg: string | undefined;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--fonts-dir") {
    fontsDirArg = args[i + 1];
    i += 1;
  } else if (!inputArg) {
    inputArg = a;
  } else if (!outputArg) {
    outputArg = a;
  }
}
if (!inputArg || !outputArg) usage();

const inputPath = resolve(process.cwd(), inputArg!);
const outputPath = resolve(process.cwd(), outputArg!);

const candidateFontDirs = [
  fontsDirArg ? resolve(process.cwd(), fontsDirArg) : "",
  resolve(__dirname, "..", "fonts"),
  resolve(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "impower-dev",
    "src",
    "public",
    "fonts",
  ),
].filter(Boolean);

const loadFontsFrom = (dir: string) => {
  const read = (name: string) => {
    const buf = readFileSync(resolve(dir, name));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  };
  return {
    normal: read("courier-prime.ttf"),
    bold: read("courier-prime-bold.ttf"),
    italic: read("courier-prime-italic.ttf"),
    bolditalic: read("courier-prime-bold-italic.ttf"),
  };
};

let fonts: ReturnType<typeof loadFontsFrom> | undefined;
let usedDir = "";
for (const dir of candidateFontDirs) {
  try {
    fonts = loadFontsFrom(dir);
    usedDir = dir;
    break;
  } catch {
    // try next
  }
}
if (!fonts) {
  console.error(
    "Could not find Courier Prime fonts. Tried:\n  " +
      candidateFontDirs.join("\n  ") +
      "\nPass --fonts-dir <dir> with the 4 ttf files.",
  );
  process.exit(2);
}

const config = {
  screenplay_print_title_page: true,
  screenplay_print_bookmarks_for_invisible_headings: true,
  screenplay_print_dialogue_split_across_pages: true,
  screenplay_print_page_numbers: true,
  screenplay_print_headings_bold: true,
  screenplay_print_scene_numbers: "left" as const,
};

const script = readFileSync(inputPath, "utf8");

buildPDF([script], config, fonts)
  .then((arrayBuffer) => {
    writeFileSync(outputPath, Buffer.from(arrayBuffer));
    console.log(
      `Wrote ${outputPath} (${arrayBuffer.byteLength} bytes; fonts: ${usedDir})`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(3);
  });
