export interface DisplayCommandConfig {
  ui: {
    root: string;
    character: string;
    background: string;
    portrait: string;
    parenthetical: string;
    dialogue_group: string;
    indicator: string;
    choice: string;
    dialogue: string;
    action: string;
    centered: string;
    transition: string;
    scene: string;
  };
  hidden: {
    character: string;
    parenthetical: string;
  };
  typing: {
    fadeDuration: number;
    delay: number;
    pauseScale: number;
    beepDuration: number;
    syllableLength: number;
  };
  indicator: {
    fadeDuration: number;
    animationName: string;
    animationDuration: number;
    animationEase: string;
  };
  css: string;
}
