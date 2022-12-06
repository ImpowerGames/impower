import { EaseType } from "../../core/types/EaseType";
import { Wave } from "./Wave";

export interface Tone {
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
  /** oscillator waves to append */
  waves?: Wave[];

  /** normalized volume (0-1) */
  volume?: number;

  /** attack time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *  |-A-|
   * ~~~
   */
  attackTime?: number;
  /** hold time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *      |-H-|
   * ~~~
   */
  holdTime?: number;
  /** decay time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *          |-D-|
   * ~~~
   */
  decayTime?: number;
  /** sustain level (0-1) (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   | ^ | \
   *  /   |   |   | ^ |  \  0
   *                S
   * ~~~
   */
  sustainLevel?: number;
  /** release time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *                  |-R-|
   * ~~~
   */
  releaseTime?: number;

  /** attack ease type (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *  |-A-|
   * ~~~
   */
  attackEase?: EaseType;
  /** decay ease type (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *          |-D-|
   * ~~~
   */
  decayEase?: EaseType;
  /** release ease type (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *                  |-R-|
   * ~~~
   */
  releaseEase?: EaseType;
}
