export interface ChoiceProperties {
  className: string;
}

export interface ChoiceCommandConfig extends Record<string, ChoiceProperties> {
  choice: ChoiceProperties;
}
