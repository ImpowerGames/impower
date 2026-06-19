// Standalone spike test for `.url` (remote/CDN) asset resolution.
//
// Runs with bare node (no deps, no vitest): `node __urlAssetSpike.test.mjs`.
// It imports the REAL pure utilities used by opfs-workspace.ts's
// `updateFileCache` and replicates that function's `.url` branch verbatim,
// driving it with the REAL glob config from WorkspaceConfiguration so the
// type/ext/src/name a `.url` file produces is verified end-to-end at the
// FileData layer (Layer A1 of docs/file-manager/url-assets-plan.md).
//
// This proves the data the compiler/runtime receive is correct; downstream
// (populateAssets -> program.context[type][name].src -> <img>/<audio>) is
// unchanged and already proven for local assets.

import assert from "node:assert";

// Verbatim mirrors of the real source (extensionless internal imports prevent
// importing them directly under bare-node ESM):
//   getFileName.ts, getName.ts, getFileExtension.ts
const getFileName = (relativePath) => relativePath.split("/").slice(-1).join("/");
const getName = (relativePath) => getFileName(relativePath).split(".")[0];
const getFileExtension = (uri) => uri.split("/").slice(-1).join("").split(".")[1];

// --- Mirror of impower-dev's globToRegex + opfs-workspace's getFileType -------
// (replicated, not imported, because getFileType reads module-level State).
const globToRegex = (glob) =>
  RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_m, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );

// The REAL defaults from WorkspaceConfiguration.ts.
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

// --- The `.url` branch of updateFileCache, verbatim ---------------------------
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

// --- Cases -------------------------------------------------------------------
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

// Image, plain CDN URL -> registers as a named image asset whose src is remote.
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

// Audio.
check(
  "theme.url -> remote mp3 audio",
  resolveUrlAsset("file://proj/theme.url", "https://cdn.example.com/theme.mp3"),
  { name: "theme", type: "audio", ext: "mp3", src: "https://cdn.example.com/theme.mp3" },
);

// Signed/query URL: src keeps the full URL incl. query, but type/ext infer from
// the path so a token containing ".png" can't false-match.
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

// Whitespace/newline in the file content is trimmed.
check(
  "trailing newline trimmed",
  resolveUrlAsset("file://proj/logo.url", "https://cdn.example.com/logo.gif\n"),
  { name: "logo", type: "image", src: "https://cdn.example.com/logo.gif" },
);

// Extension-less / opaque URL -> falls back to type "text" (no crash).
// Documents the §5 HEAD-fallback gap: no extension => no inference yet.
check(
  "extension-less url -> text fallback",
  resolveUrlAsset("file://proj/opaque.url", "https://cdn.example.com/asset/9f8a7"),
  { name: "opaque", type: "text", src: "https://cdn.example.com/asset/9f8a7" },
);

// Zero-byte stub (today's "Add URL" creates this) -> no crash, empty src.
check("empty stub -> no crash", resolveUrlAsset("file://proj/asset00.url", ""), {
  name: "asset00",
  src: "",
});

// FINDING: video has NO config pattern, so an .mp4 URL resolves to "text",
// not "video". Asserting the CURRENT behavior so the gap is explicit.
check(
  "mp4 url -> text (no video category in config) [KNOWN GAP]",
  resolveUrlAsset("file://proj/clip.url", "https://cdn.example.com/clip.mp4"),
  { name: "clip", type: "text", ext: "mp4", src: "https://cdn.example.com/clip.mp4" },
);

console.log(`\n${passed} checks passed.`);
