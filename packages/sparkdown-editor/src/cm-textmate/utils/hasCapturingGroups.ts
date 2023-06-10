/** Returns if the given `RegExp` has any remembered capturing groups. */
export function hasCapturingGroups(regexp: RegExp) {
  // give an alternative that always matches
  const always = new RegExp(`|${regexp.source}`);
  // ... which means we can use it to get a successful match,
  // regardless of the original regex. this is a bit of a hack,
  // but we can use this to detect capturing groups.
  return always.exec("")!.length > 1;
}
