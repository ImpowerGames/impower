export interface VSCodeSnippetDefinition {
  prefix: string | string[];
  body: string | string[];
  description?: string;
}

export type VSCodeSnippetsDefinition = Readonly<Record<string, unknown>>;
