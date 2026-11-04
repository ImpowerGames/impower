export type ThemeVariables = ReadonlySet<string>;

export type StyleTransformer = (value: any, theme: ThemeVariables) => string;
