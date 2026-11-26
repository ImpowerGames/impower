import assert from "node:assert";

const getFileName = (relativePath) => relativePath.split("/").slice(-1).join("/");
const getName = (relativePath) => getFileName(relativePath).split(".")[0];
const getFileExtension = (uri) => uri.split("/").slice(-1).join("").split(".")[1];

const globToRegex = (glob) =>
  RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_m, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );

const scriptFilePattern = globToRegex("*.{sd}");
const imageFilePattern = globToRegex("*.{png,apng,jpeg,jpg,gif,bmp,svg,webp}");
const audioFilePattern = globToRegex("*.{mid,wav,mp3,mp2,ogg,aac,opus,flac}");
const fontFilePattern = globToRegex("*.{ttf,woff,woff2,otf}");

const getFileType = (uri) => {
  if (scriptFilePattern.test(uri)) return "script";
  if (imageFilePattern.test(uri)) return "image";
  if (audioFilePattern.test(uri)) return "audio";
  if (fontFilePattern.test(uri)) return "font";
  return "text";
};

const resolveUrlAsset = (uri, contentText) => {
  const buffer = new TextEncoder().encode(contentText);
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getFileType(uri);

  const url = new TextDecoder("utf-8").decode(buffer).trim();
  const urlPath = url.split(/[?#]/)[0] || "";
  return {
    uri,
    name,
    ext: getFileExtension(urlPath) || ext,
    type: url ? getFileType(urlPath) : type,
    src: url,
    version: 0,
    languageId: null,
    text: url,
  };
};

let passed = 0;
const check = (label, actual, expected) => {
  for (const k of Object.keys(expected)) {
    assert.deepStrictEqual(
      actual[k],
      expected[k],
      `${label}: .${k} = ${JSON.stringify(actual[k])}, expected ${JSON.stringify(
        expected[k],
      )}`,
    );
  }
  passed++;
  console.log(`  ok  ${label}`);
};

console.log("URL asset resolution spike:");

check(
  "hero.url -> remote png image",
  resolveUrlAsset("file://proj/hero.url", "https://cdn.example.com/art/hero.png"),
  {
    name: "hero",
    type: "image",
    ext: "png",
    src: "https://cdn.example.com/art/hero.png",
  },
);

check(
  "theme.url -> remote mp3 audio",
  resolveUrlAsset("file://proj/theme.url", "https://cdn.example.com/theme.mp3"),
  { name: "theme", type: "audio", ext: "mp3", src: "https://cdn.example.com/theme.mp3" },
);

check(
  "signed url keeps query, infers from path",
  resolveUrlAsset(
    "file://proj/bg.url",
    "https://cdn.example.com/bg.webp?token=abc.png&exp=123",
  ),
  {
    name: "bg",
    type: "image",
    ext: "webp",
    src: "https://cdn.example.com/bg.webp?token=abc.png&exp=123",
  },
);

check(
  "trailing newline trimmed",
  resolveUrlAsset("file://proj/logo.url", "https://cdn.example.com/logo.gif\n"),
  { name: "logo", type: "image", src: "https://cdn.example.com/logo.gif" },
);

check(
  "extension-less url -> text fallback",
  resolveUrlAsset("file://proj/opaque.url", "https://cdn.example.com/asset/9f8a7"),
  { name: "opaque", type: "text", src: "https://cdn.example.com/asset/9f8a7" },
);

check("empty stub -> no crash", resolveUrlAsset("file://proj/asset00.url", ""), {
  name: "asset00",
  src: "",
});

check(
  "mp4 url -> text (no video category in config) [KNOWN GAP]",
  resolveUrlAsset("file://proj/clip.url", "https://cdn.example.com/clip.mp4"),
  { name: "clip", type: "text", ext: "mp4", src: "https://cdn.example.com/clip.mp4" },
);

console.log(`\n${passed} checks passed.`);
