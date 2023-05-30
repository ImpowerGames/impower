import { Create } from "../../core/types/Create";
import { Intonation } from "../types/Intonation";

export const _intonation: Create<Intonation> = () => ({
  phrasePitchIncrement: 0.25,
  phrasePitchMaxOffset: 1,

  downdriftIncrement: 0.025,
  syllableFluctuation: 0.25,

  stressLevelSemitones: 0.5,

  /**
   * ▆ ▂
   * 1 -5
   */
  liltQuestion: {
    phraseSlope: 0,
    neutralLevel: 2,
    finalContour: [4, 2],
    emphasisContour: [4, 2],
    pitchRamp: 0.2,
    pitchAccel: -0.3,
    pitchJerk: -0.5,
    finalDilation: 3,
    volumeRamp: 0,
  },
  /**
   * ▆ ▂
   * 1 -5
   */
  liltExclamation: {
    phraseSlope: 0,
    neutralLevel: 3,
    finalContour: [5, 4],
    emphasisContour: [5, 4],
    pitchRamp: 0.2,
    pitchAccel: -0.3,
    pitchJerk: -0.5,
    finalDilation: 3,
    volumeRamp: 0,
  },
  /**
   * ▆ ▂
   * 1 -5
   */
  lilt: {
    phraseSlope: 0,
    neutralLevel: 0,
    finalContour: [1, -5],
    emphasisContour: [1, -5],
    pitchRamp: 0.2,
    pitchAccel: -0.3,
    pitchJerk: -0.5,
    finalDilation: 2,
    volumeRamp: 0,
  },
  /**
   * ▆ ▂
   * 2 -5
   */
  resolvedAnxiousQuestion: {
    phraseSlope: 1,
    neutralLevel: 0,
    finalContour: [3, 4],
    emphasisContour: [3, 4],
    finalDilation: 3,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: 0,
  },
  /**
   * ▆ ▇
   * 1  2
   */
  anxiousQuestion: {
    phraseSlope: 1,
    neutralLevel: 0,
    finalContour: [1, 2],
    emphasisContour: [1, 2],
    finalDilation: 4,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: -0.25,
  },
  /**
   * ▆ ▂
   * 2 -5
   */
  resolvedQuestion: {
    phraseSlope: 1,
    neutralLevel: 0,
    finalContour: [2, -5],
    emphasisContour: [2, -5],
    finalDilation: 2,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: 0,
  },
  /**
   * ▆ ▇
   * 1  2
   */
  question: {
    phraseSlope: 2,
    neutralLevel: 0,
    finalContour: [1, 2],
    emphasisContour: [1, 2],
    finalDilation: 2,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: 0,
  },
  /**
   * ▉
   * 8
   */
  exclamation: {
    phraseSlope: 2,
    neutralLevel: 4,
    finalContour: [5],
    emphasisContour: [6],
    finalDilation: 2,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: -0.5,
    volumeRamp: 0,
  },
  /**
   * ▆ ▂
   * 1 -5
   */
  comma: {
    phraseSlope: 1,
    neutralLevel: 0,
    finalContour: [1, -5],
    emphasisContour: [1, -5],
    finalDilation: 2,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: 0,
  },
  /**
   * ▆ ▇
   * 1  2
   */
  partial: {
    phraseSlope: 2,
    neutralLevel: 0,
    finalContour: [1, 2],
    emphasisContour: [1, 2],
    finalDilation: 2,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: 0,
  },
  /**
   * ▂ ▂
   * -1 -1
   */
  anxious: {
    phraseSlope: -1,
    neutralLevel: 0,
    finalContour: [-1, -1, -1],
    emphasisContour: [-1, -1, -1],
    finalDilation: 3,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: -0.25,
    volumeRamp: -0.25,
  },
  /**
   * ▆ ▃
   * 1 -5
   */
  statement: {
    phraseSlope: -1,
    neutralLevel: 0,
    finalContour: [1, -5],
    emphasisContour: [3, 2, 1.5],
    finalDilation: 2,
    pitchRamp: 0,
    pitchAccel: 0,
    pitchJerk: 0,
    volumeRamp: 0,
  },
});
