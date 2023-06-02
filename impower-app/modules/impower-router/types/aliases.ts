export interface TransitionOptions {
  shallow?: boolean;
}

export type ParsedUrlQuery = { [id: string]: string | string[] };

export interface UrlObject {
  auth?: string | null;
  hash?: string | null;
  host?: string | null;
  hostname?: string | null;
  href?: string | null;
  pathname?: string | null;
  protocol?: string | null;
  search?: string | null;
  slashes?: boolean | null;
  port?: string | number | null;
  query?: string | null | ParsedUrlQuery;
}

export type Url = UrlObject | string;

export interface RouteState {
  isAuthPage?: boolean;
}
