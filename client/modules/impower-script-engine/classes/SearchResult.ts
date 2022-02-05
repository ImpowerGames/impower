import { Container } from "./Container";
import { RuntimeObject } from "./RuntimeObject";

export class SearchResult {
  public obj: RuntimeObject = null;

  public approximate = false;

  get correctObj(): RuntimeObject {
    return this.approximate ? null : this.obj;
  }

  get container(): Container {
    return this.obj instanceof Container ? this.obj : null;
  }

  public copy(): SearchResult {
    const searchResult = new SearchResult();
    searchResult.obj = this.obj;
    searchResult.approximate = this.approximate;

    return searchResult;
  }
}
