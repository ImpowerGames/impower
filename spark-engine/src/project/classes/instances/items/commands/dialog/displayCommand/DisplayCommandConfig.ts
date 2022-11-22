import { TypingConfig } from "./TypingConfig";

export interface DisplayProperties {
  className?: string;
  hidden?: string;
  typing?: TypingConfig;
  indicator?: {
    className: string;
    fadeDuration?: number;
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
