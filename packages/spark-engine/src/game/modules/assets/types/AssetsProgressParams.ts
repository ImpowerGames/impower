/** Page to engine: how far one pinned request has come. `loaded + failed`
 *  reaches `total` when it settles. */
export interface AssetsProgressParams {
  pin: string;
  loaded: number;
  failed: number;
  total: number;
}
