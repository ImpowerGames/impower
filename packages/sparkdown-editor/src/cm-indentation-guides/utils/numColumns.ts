/**
 * Returns the number of columns that a string is indented, controlling for
 * tabs. This is useful for determining the indentation level of a line.
 *
 * Note that this only returns the number of _visible_ columns, not the number
 * of whitespace characters at the start of the string.
 *
 * @param str - The string to check.
 * @param tabSize - The size of a tab character. Usually 2 or 4.
 */
export function numColumns(str: string, tabSize: number) {
  // as far as I can tell, this is pretty much the fastest way to do this,
  // at least involving iteration. `str.length - str.trimStart().length` is
  // much faster, but it has some edge cases that are hard to deal with.

  let col = 0;

  // eslint-disable-next-line no-restricted-syntax
  loop: for (let i = 0; i < str.length; i++) {
    switch (str[i]) {
      case " ": {
        col += 1;
        continue loop;
      }

      case "\t": {
        // if the current column is a multiple of the tab size, we can just
        // add the tab size to the column. otherwise, we need to add the
        // difference between the tab size and the current column.
        col += tabSize - (col % tabSize);
        continue loop;
      }

      case "\r": {
        continue loop;
      }

      default: {
        break loop;
      }
    }
  }

  return col;
}
