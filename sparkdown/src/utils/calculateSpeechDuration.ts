const santizerRegex = /[^\w]/gi;
const punctuationRegex = /(\.|\?|!|:) |(, )/g;

/**
 * Calculate an approximation of how long a line of text would take to say
 */
export const calculateSpeechDuration = (dialogue: string): number => {
  let duration = 0;

  //According to this paper: http://www.office.usp.ac.jp/~klinger.w/2010-An-Analysis-of-Articulation-Rates-in-Movies.pdf
  //The average amount of syllables per second in the 14 movies analysed is 5.13994 (0.1945548s/syllable)
  const sanitized = dialogue.replace(santizerRegex, "");
  duration += (sanitized.length / 3) * 0.1945548;
  //duration += syllable(dialogue)*0.1945548;

  //According to a very crude analysis involving watching random movie scenes on youtube and measuring pauses with a stopwatch
  //A comma in the middle of a sentence adds 0.4sec and a full stop/excalmation/question mark adds 0.8 sec.
  const punctuationMatches = dialogue.match(punctuationRegex);
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
