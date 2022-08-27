export interface ChoiceProperties {
  id: string;
}

export interface ChoiceCommandConfig extends Record<string, ChoiceProperties> {
  choice: ChoiceProperties;
}
