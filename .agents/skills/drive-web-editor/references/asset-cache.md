# Asset cache evidence

Read before asset-cache measurements or rendered before/after checks, including when using existing UI operations.

## Gotchas

- Responses from the worker's asset endpoints carry `Cache-Control: max-age=31536000, immutable`, so the browser's own HTTP cache answers the second half of a before/after with the first half's bytes. `fetch(url, { cache: "reload" })` escapes it for a raw byte measurement; a rendered `<img>` in the game preview does not, so give each phase its own asset filename, since the url is the cache key.
- The first asset request after a cold server boot can fail in a fresh browser profile: the image comes back `complete: true` with a natural size of 0 and draws as nothing, while the identical url loads seconds later in the same page, because the service worker that serves `/file:/` is not controlling the page yet. Re-run before concluding an asset does not load.
