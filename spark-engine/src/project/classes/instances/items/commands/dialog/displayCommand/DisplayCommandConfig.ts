export interface DisplayProperties {
  className?: string;
  hidden?: string;
  typing?: {
    fadeDuration?: number;
    delay?: number;
    pauseScale?: number;
    beepDuration?: number;
    syllableLength?: number;
  };
  indicator?: {
    className: string;
    fadeDuration?: number;
    animationName?: string;
    animationDuration?: number;
    animationEase?: string;
  };
}

export interface DisplayCommandConfig
  extends Partial<Record<string, DisplayProperties>> {
  default?: Omit<DisplayProperties, "className">;
  background?: DisplayProperties;
  portrait?: DisplayProperties;
  description_group?: DisplayProperties;
  dialogue_group?: DisplayProperties;
  choice?: DisplayProperties;
  character?: DisplayProperties;
  parenthetical?: DisplayProperties;
  dialogue?: DisplayProperties;
  action?: DisplayProperties;
  centered?: DisplayProperties;
  transition?: DisplayProperties;
  scene?: DisplayProperties;
}
