let EMOJI_REGEX: RegExp | null = null;
try {
  EMOJI_REGEX = new RegExp("\\p{RGI_Emoji}", "gv");
} catch {
  EMOJI_REGEX = null;
}

export interface EmojiTextRun {
  text: string;
  isEmoji: boolean;
}

export const splitEmojiRuns = (text: string): EmojiTextRun[] => {
  if (!EMOJI_REGEX || !text) {
    return [{ text, isEmoji: false }];
  }
  const runs: EmojiTextRun[] = [];
  let last = 0;
  EMOJI_REGEX.lastIndex = 0;
  for (let m = EMOJI_REGEX.exec(text); m; m = EMOJI_REGEX.exec(text)) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index), isEmoji: false });
    }
    runs.push({ text: m[0], isEmoji: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), isEmoji: false });
  }
  return runs.length ? runs : [{ text, isEmoji: false }];
};
