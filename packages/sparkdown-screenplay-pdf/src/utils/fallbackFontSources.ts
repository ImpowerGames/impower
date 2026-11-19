export interface FallbackFontFaces {
  normal: ArrayBuffer;
  bold?: ArrayBuffer;
}

export type FallbackScript = "sans" | "thai" | "cjk";

export interface FallbackFontSource {
  name: string;
  script: FallbackScript;
  region?: "japanese" | "korean" | "chinese";
  normal: string;
  bold: string;
}

const GSTATIC = "https://fonts.gstatic.com/s/";

export const FALLBACK_FONT_SOURCES: FallbackFontSource[] = [
  {
    name: "Noto Sans",
    script: "sans",
    normal: `${GSTATIC}notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf`,
    bold: `${GSTATIC}notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf`,
  },
  {
    name: "Noto Sans Thai",
    script: "thai",
    normal: `${GSTATIC}notosansthai/v29/iJWnBXeUZi_OHPqn4wq6hQ2_hbJ1xyN9wd43SofNWcd1MKVQt_So_9CdU5RtpzE.ttf`,
    bold: `${GSTATIC}notosansthai/v29/iJWnBXeUZi_OHPqn4wq6hQ2_hbJ1xyN9wd43SofNWcd1MKVQt_So_9CdU3NqpzE.ttf`,
  },
  {
    name: "Noto Sans JP",
    script: "cjk",
    region: "japanese",
    normal: `${GSTATIC}notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf`,
    bold: `${GSTATIC}notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf`,
  },
  {
    name: "Noto Sans KR",
    script: "cjk",
    region: "korean",
    normal: `${GSTATIC}notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf`,
    bold: `${GSTATIC}notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf`,
  },
  {
    name: "Noto Sans SC",
    script: "cjk",
    region: "chinese",
    normal: `${GSTATIC}notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYw.ttf`,
    bold: `${GSTATIC}notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaGzjCnYw.ttf`,
  },
];

const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\u3200-\u33ff\u31f0-\u31ff\ufe30-\ufe4f\uff00-\uffef]/u;

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

const HANGUL = /\p{Script=Hangul}/u;

export const RIGHT_TO_LEFT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Yezidi}]/u;

export const fallbackScriptOf = (character: string): FallbackScript | undefined => {
  if (RIGHT_TO_LEFT.test(character)) return undefined;
  if (CJK.test(character)) return "cjk";
  if (/\p{Script=Thai}/u.test(character)) return "thai";
  return "sans";
};

export const fallbackFontSourcesFor = (characters: Iterable<string>): FallbackFontSource[] => {
  const scripts = new Set<FallbackScript>();
  const regions = new Set<FallbackFontSource["region"]>();
  let otherCjk = false;
  for (const character of characters) {
    const script = fallbackScriptOf(character);
    if (!script) continue;
    scripts.add(script);
    if (script !== "cjk") continue;
    if (KANA.test(character)) regions.add("japanese");
    else if (HANGUL.test(character)) regions.add("korean");
    else otherCjk = true;
  }
  if (otherCjk && regions.size === 0) regions.add("chinese");
  return FALLBACK_FONT_SOURCES.filter((source) =>
    source.script === "cjk" ? regions.has(source.region) : scripts.has(source.script),
  );
};
