export interface DisplayProperties {
  id: string;
  hidden?: string;
  typing?: {
    fadeDuration?: number;
    delay?: number;
    pauseScale?: number;
    beepDuration?: number;
    syllableLength?: number;
  };
  indicator?: {
    id: string;
    fadeDuration?: number;
    animationName?: string;
    animationDuration?: number;
    animationEase?: string;
  };
}

export interface DisplayCommandConfig
  extends Record<string, DisplayProperties> {
  root: DisplayProperties;
  background: DisplayProperties;
  portrait: DisplayProperties;
  description_group: DisplayProperties;
  dialogue_group: DisplayProperties;
  choice?: DisplayProperties;
  character?: DisplayProperties;
  parenthetical?: DisplayProperties;
  dialogue?: DisplayProperties;
  action?: DisplayProperties;
  centered?: DisplayProperties;
  transition?: DisplayProperties;
  scene?: DisplayProperties;
}
