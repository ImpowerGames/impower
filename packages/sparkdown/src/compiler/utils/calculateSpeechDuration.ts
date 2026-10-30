const SANITIZER_REGEX = /[^\w]/gi;
const PUNCTUATION_REGEX = /(\.|\?|!|:) |(, )/g;

export const calculateSpeechDuration = (dialogue: string): number => {
  let duration = 0;

  const sanitized = dialogue.replace(SANITIZER_REGEX, "");
  duration += (sanitized.length / 3) * 0.1945548;

  const punctuationMatches = dialogue.match(PUNCTUATION_REGEX);
  if (punctuationMatches) {
    if (punctuationMatches[0]) {
      duration += 0.75 * punctuationMatches[0].length;
    }
    if (punctuationMatches[1]) {
      duration += 0.3 * punctuationMatches[1].length;
    }
  }
  return duration;
};
