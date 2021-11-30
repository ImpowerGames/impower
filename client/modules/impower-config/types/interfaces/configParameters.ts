import { Message } from "../enums/message";

export interface TagConfigParameters {
  /**
   * Our map of project tags organized by category and grouped by specificity [[...specific], [...general]]
   */
  projectTags: { [categories: string]: string[][] };
  /**
   * Our map of moods organized by category (personality or emotion) and grouped by sentiment [[...positive], [...negative]]
   */
  moods: { [categories: string]: string[][] };
  /**
   * Our list of catalysts
   */
  catalysts: string[];
  /**
   * Our map of resource tags organized by category
   */
  resourceTags: {
    [categories: string]: string[];
  };
  /**
   * Our map of role tags organized by category
   */
  roleTags: { [categories: string]: string[] };
  /**
   * Our map of tags -> color names
   */
  tagColorNames: { [tag: string]: string };
  /**
   * Our map of tags -> disambiguations
   */
  tagDisambiguations: { [tag: string]: string[] };
  /**
   * Our map of tags -> icons
   */
  tagIconNames: { [tag: string]: string };
  /**
   * Our map of tags -> patterns
   */
  tagPatterns: { [tag: string]: string };
  /**
   * Our map of visually distinct colors
   */
  colors: { [colorName: string]: string };
}

export interface GeneratorConfigParameters {
  /**
   * Our array of phrases that are used by our Punny Idea Generator
   */
  phrases: string[];
  /**
   * Our list of archetypes that are used by our Story Idea Generator
   */
  archetypes: string[];
  /**
   * Our map of terms => tags that are used by our Punny Idea Generator
   */
  terms: { [term: string]: string[] };
}

export interface LocalizationConfigParameters {
  /**
   * Our map of keys => localized abbreviations
   */
  abbreviations: {
    count: { [unit in "k" | "m" | "b" | "t"]: string };
    age: { [unit in "m" | "h" | "d" | "mo" | "y"]: string };
  };
  /**
   * Our map of tags -> localized capitalized spelling adjustments
   */
  capitalizations: { [tag: string]: string };
  /**
   * Our map of keys => localized messages
   */
  messages: { [key in Message]: string };
  /**
   * Our map of special formatter variables -> regexes
   */
  regexes: {
    [variable: string]: { [regex: string]: string };
  };
}

export interface ConfigParameters
  extends Partial<TagConfigParameters>,
    Partial<GeneratorConfigParameters>,
    Partial<LocalizationConfigParameters> {}
