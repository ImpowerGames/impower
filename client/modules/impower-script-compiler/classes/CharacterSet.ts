export class CharacterSet extends Array<string> {
  public static FromRange(start: string, end: string): CharacterSet {
    return new CharacterSet().AddRange(start, end);
  }

  constructor(arg?: string | CharacterSet) {
    super();
    this.AddCharacters(arg);
  }

  public AddRange(start: string, end: string): CharacterSet {
    for (let c = start.charCodeAt(0); c <= end.charCodeAt(0); c += 1) {
      this.push(String.fromCharCode(c));
    }
    return this;
  }

  public AddCharacters(str: string | CharacterSet): CharacterSet {
    if (typeof str === "string") {
      for (let i = 0; i < str.length; i += 1) {
        const c = str[i];
        this.push(c);
      }
    } else {
      for (let i = 0; i < str.length; i += 1) {
        const c = str[i];
        this.push(c);
      }
    }
    return this;
  }

  public UnionWith(otherSet: CharacterSet): CharacterSet {
    const union = new CharacterSet(this);
    otherSet.forEach((value, key) => {
      union[key] = value;
    });

    return union;
  }
}
