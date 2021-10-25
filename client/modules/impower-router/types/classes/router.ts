import { NextRouter } from "next/router";
import { ParsedUrlQuery } from "../aliases";

export class Router {
  private _internal: NextRouter;

  private get internal(): NextRouter {
    return this._internal;
  }

  get route(): string {
    return this.internal.route;
  }

  get query(): ParsedUrlQuery {
    return this.internal.query;
  }

  constructor(router: NextRouter) {
    this._internal = router;
  }

  static getBaseRoute(url: string): string {
    const subPageIndex = url.substring(1).indexOf("/");
    if (subPageIndex >= 0) {
      return url.substring(0, subPageIndex + 1);
    }
    return url;
  }

  static isAuthPage(url: string): boolean {
    const baseRoute = Router.getBaseRoute(url);
    return (
      baseRoute === "/signup" ||
      baseRoute === "/login" ||
      baseRoute === "/confirm" ||
      baseRoute === "/forgot-password"
    );
  }
}
