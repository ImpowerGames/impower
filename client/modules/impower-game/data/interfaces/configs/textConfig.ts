export interface TextConfig {
  separator: string;
}

export const isTextConfig = (obj: unknown): obj is TextConfig => {
  if (!obj) {
    return false;
  }
  const textConfig = obj as TextConfig;
  return textConfig.separator !== undefined;
};

export const createTextConfig = (obj?: Partial<TextConfig>): TextConfig => ({
  separator: "\\n",
  ...obj,
});
