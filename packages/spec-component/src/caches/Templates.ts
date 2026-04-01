import { LRUCache } from "../classes/LRUCache";

export abstract class Templates {
  static cache = new LRUCache<string, HTMLTemplateElement>();
}
