/**
 * txml <https://github.com/TobiasNickel/tXml>
 *
 * Copyright (c) 2015 Tobias Nickel
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

export type Node =
  | {
      tagName: string;
      attributes: Record<string, string>;
      children: Node[];
    }
  | string
  | null;

export type Document = Node | Node[];

export function parse(
  S: string,
  options?: {
    pos?: number;
    keepComments?: boolean;
    keepWhitespace?: boolean;
    noChildNodes?: string[];
    attrName?: string;
    attrValue?: string;
    parseNode?: boolean;
  }
): Document {
  "txml";
  options = options || {};

  var pos = options.pos || 0;
  var keepComments = !!options.keepComments;
  var keepWhitespace = !!options.keepWhitespace;

  var openBracket = "<";
  var openBracketCC = "<".charCodeAt(0);
  var closeBracket = ">";
  var closeBracketCC = ">".charCodeAt(0);
  var minusCC = "-".charCodeAt(0);
  var slashCC = "/".charCodeAt(0);
  var exclamationCC = "!".charCodeAt(0);
  var singleQuoteCC = "'".charCodeAt(0);
  var doubleQuoteCC = '"'.charCodeAt(0);
  var openCornerBracketCC = "[".charCodeAt(0);
  var closeCornerBracketCC = "]".charCodeAt(0);

  /**
   * parsing a list of entries
   */
  function parseChildren(tagName: string) {
    var children: Node[] = [];
    while (S[pos]) {
      if (S.charCodeAt(pos) == openBracketCC) {
        if (S.charCodeAt(pos + 1) === slashCC) {
          var closeStart = pos + 2;
          pos = S.indexOf(closeBracket, pos);

          var closeTag = S.substring(closeStart, pos);
          if (closeTag.indexOf(tagName) == -1) {
            var parsedText = S.substring(0, pos).split("\n");
            throw new Error(
              "Unexpected close tag\nLine: " +
                (parsedText.length - 1) +
                "\nColumn: " +
                (parsedText[parsedText.length - 1]!.length + 1) +
                "\nChar: " +
                S[pos]
            );
          }

          if (pos + 1) pos += 1;

          return children;
        } else if (S.charCodeAt(pos + 1) === exclamationCC) {
          if (S.charCodeAt(pos + 2) == minusCC) {
            //comment support
            const startCommentPos = pos;
            while (
              pos !== -1 &&
              !(
                S.charCodeAt(pos) === closeBracketCC &&
                S.charCodeAt(pos - 1) == minusCC &&
                S.charCodeAt(pos - 2) == minusCC &&
                pos != -1
              )
            ) {
              pos = S.indexOf(closeBracket, pos + 1);
            }
            if (pos === -1) {
              pos = S.length;
            }
            if (keepComments) {
              children.push(S.substring(startCommentPos, pos + 1));
            }
          } else if (
            S.charCodeAt(pos + 2) === openCornerBracketCC &&
            S.charCodeAt(pos + 8) === openCornerBracketCC &&
            S.substr(pos + 3, 5).toLowerCase() === "cdata"
          ) {
            // cdata
            var cdataEndIndex = S.indexOf("]]>", pos);
            if (cdataEndIndex == -1) {
              children.push(S.substr(pos + 9));
              pos = S.length;
            } else {
              children.push(S.substring(pos + 9, cdataEndIndex));
              pos = cdataEndIndex + 3;
            }
            continue;
          } else {
            // doctypesupport
            const startDoctype = pos + 1;
            pos += 2;
            var encapsuled = false;
            while (
              (S.charCodeAt(pos) !== closeBracketCC || encapsuled === true) &&
              S[pos]
            ) {
              if (S.charCodeAt(pos) === openCornerBracketCC) {
                encapsuled = true;
              } else if (
                encapsuled === true &&
                S.charCodeAt(pos) === closeCornerBracketCC
              ) {
                encapsuled = false;
              }
              pos++;
            }
            children.push(S.substring(startDoctype, pos));
          }
          pos++;
          continue;
        }
        var node = parseNode();
        children.push(node);
        if (typeof node === "object" && node && node.tagName[0] === "?") {
          children.push(...node.children);
          node.children = [];
        }
      } else {
        var text = parseText();
        if (keepWhitespace) {
          if (text.length > 0) {
            children.push(text);
          }
        } else {
          var trimmed = text.trim();
          if (trimmed.length > 0) {
            children.push(trimmed);
          }
        }
        pos++;
      }
    }
    return children;
  }

  /**
   *    returns the text outside of texts until the first '<'
   */
  function parseText() {
    var start = pos;
    pos = S.indexOf(openBracket, pos) - 1;
    if (pos === -2) pos = S.length;
    return S.slice(start, pos + 1);
  }
  /**
   *    returns text until the first nonAlphabetic letter
   */
  var nameSpacer = "\r\n\t>/= ";

  function parseName() {
    var start = pos;
    while (nameSpacer.indexOf(S[pos]!) === -1 && S[pos]) {
      pos++;
    }
    return S.slice(start, pos);
  }
  /**
   *    is parsing a node, including tagName, Attributes and its children,
   * to parse children it uses the parseChildren again, that makes the parsing recursive
   */
  var NoChildNodes = options.noChildNodes || [
    "img",
    "br",
    "input",
    "meta",
    "link",
    "hr",
  ];

  function parseNode(): Node {
    pos++;
    const tagName = parseName();
    const attributes: Record<string, string> = {};
    let children: Node[] = [];

    // parsing attributes
    while (S.charCodeAt(pos) !== closeBracketCC && S[pos]) {
      var c = S.charCodeAt(pos);
      if ((c > 64 && c < 91) || (c > 96 && c < 123)) {
        //if('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(S[pos])!==-1 ){
        var name = parseName();
        // search beginning of the string
        var code = S.charCodeAt(pos);
        while (
          code &&
          code !== singleQuoteCC &&
          code !== doubleQuoteCC &&
          !((code > 64 && code < 91) || (code > 96 && code < 123)) &&
          code !== closeBracketCC
        ) {
          pos++;
          code = S.charCodeAt(pos);
        }
        if (code === singleQuoteCC || code === doubleQuoteCC) {
          var value: string | null = parseString();
          if (pos === -1) {
            return {
              tagName,
              attributes,
              children,
            };
          }
        } else {
          value = null;
          pos--;
        }
        if (value != null) {
          attributes[name] = value;
        } else {
          delete attributes[name];
        }
      }
      pos++;
    }
    // optional parsing of children
    if (S.charCodeAt(pos - 1) !== slashCC) {
      if (tagName == "script") {
        var start = pos + 1;
        pos = S.indexOf("</script>", pos);
        children = [S.slice(start, pos)];
        pos += 9;
      } else if (tagName == "style") {
        var start = pos + 1;
        pos = S.indexOf("</style>", pos);
        children = [S.slice(start, pos)];
        pos += 8;
      } else if (NoChildNodes.indexOf(tagName) === -1) {
        pos++;
        children = parseChildren(tagName);
      } else {
        pos++;
      }
    } else {
      pos++;
    }
    return {
      tagName,
      attributes,
      children,
    };
  }

  /**
   *    is parsing a string, that starts with a char and with the same usually  ' or "
   */

  function parseString() {
    var startChar = S[pos]!;
    var startpos = pos + 1;
    pos = S.indexOf(startChar, startpos);
    return S.slice(startpos, pos);
  }

  /**
   *
   */
  function findElements() {
    var r = new RegExp(
      "\\s" + options?.attrName + "\\s*=['\"]" + options?.attrValue + "['\"]"
    ).exec(S);
    if (r) {
      return r.index;
    } else {
      return -1;
    }
  }

  var out: Node | Node[] | null = null;
  if (options.attrValue !== undefined) {
    options.attrName = options.attrName || "id";
    var out: Node | Node[] | null = [];

    while ((pos = findElements()) !== -1) {
      pos = S.lastIndexOf("<", pos);
      if (pos !== -1) {
        out.push(parseNode());
      }
      S = S.substr(pos);
      pos = 0;
    }
  } else if (options.parseNode) {
    out = parseNode();
  } else {
    out = parseChildren("");
  }

  return out;
}

/**
 * behaves the same way as Array.traverse, if the traverse method return true, the element is in the resultList
 * @params children{Array} the children of a node
 * @param f{function} the traverse method
 */
export function traverse(
  children: Document,
  f: (
    child: Node,
    index: number,
    depth: number,
    path: string,
    parent: Node | null
  ) => void,
  dept = 0,
  path = "",
  parent: Node | null = null
) {
  if (Array.isArray(children)) {
    children.forEach((child: Node, i: number) => {
      if (typeof child === "object" && child) {
        f(child, i, dept, path, parent);
        if (child.children) {
          traverse(
            child.children,
            f,
            dept + 1,
            (path ? path + "." : "") + i + "." + child.tagName,
            child
          );
        }
      }
    });
  }
}

/**
 * stringify a previously parsed string object.
 * this is useful,
 *  1. to remove whitespace
 * 2. to recreate xml data, with some changed data.
 * @param {tNode} O the object to Stringify
 */
export function stringify(
  O: Document,
  options?: {
    quote?: string;
    selfClosingTags: string[];
  }
): string {
  var out = "";

  const quote = options?.quote || '"';
  const selfClosingTags = options?.selfClosingTags || [];

  function writeChildren(O: Document) {
    if (O) {
      if (Array.isArray(O)) {
        for (var i = 0; i < O.length; i++) {
          const c = O[i]!;
          if (typeof c == "string") {
            out += c!.trim();
          } else {
            writeNode(c);
          }
        }
      }
    }
  }

  function writeNode(n: Node) {
    if (typeof n === "object" && n) {
      out += "<" + n.tagName;
      for (var i in n.attributes) {
        if (n.attributes[i] === null) {
          out += " " + i;
        } else if (n.attributes[i]!.indexOf('"') >= 0) {
          out += " " + i + "='" + n.attributes[i]!.trim() + "'";
        } else if (quote === "'" && n.attributes[i]!.indexOf("'") >= 0) {
          out += " " + i + '="' + n.attributes[i]!.trim() + '"';
        } else {
          out += " " + i + `=${quote}` + n.attributes[i]!.trim() + `${quote}`;
        }
      }
      if (n.tagName[0] === "?") {
        out += "?>";
        return;
      }
      if (n.children.length === 0 && selfClosingTags.includes(n.tagName)) {
        out += "/>";
      } else {
        out += ">";
        writeChildren(n.children);
        out += "</" + n.tagName + ">";
      }
    }
  }
  writeChildren(O);

  return out;
}
