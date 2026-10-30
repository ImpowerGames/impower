import { describe, expect, it } from "vitest";
import {
  asINamedContentOrNull,
  asNumberOrThrows,
  asOrNull,
  asOrThrows,
  isEquatable,
  nullIfUndefined,
} from "../../runtime/TypeAssertion";

describe("TypeAssertion", () => {
  class MainClass {
    public Equals() {
      return false;
    }
  }
  class SubClass extends MainClass {}
  class OtherClass {}

  describe("asOrNull", () => {
    it("returns the object when argument is of the right type", () => {
      const object = new MainClass();

      expect(asOrNull(object, MainClass)).toBe(object);
    });

    it("returns the object when argument is a subtype", () => {
      const object = new SubClass();

      expect(asOrNull(object, MainClass)).toBe(object);
    });

    it("returns null when argument is of the wrong type", () => {
      const object = new MainClass();

      expect(asOrNull(object, OtherClass)).toBeNull();
    });
  });

  describe("asOrThrows", () => {
    it("returns the object when argument is of the right type", () => {
      const object = new MainClass();

      expect(asOrThrows(object, MainClass)).toBe(object);
    });

    it("returns the object when argument is a subtype", () => {
      const object = new SubClass();

      expect(asOrThrows(object, MainClass)).toBe(object);
    });

    it("throws when argument is of the wrong type", () => {
      const object = new MainClass();

      expect(() => {
        asOrThrows(object, OtherClass);
      }).toThrow();
    });
  });

  describe("asNumberOrThrows", () => {
    it("returns the value if it is a number", () => {
      const number = 1;

      expect(asNumberOrThrows(number)).toBe(number);
    });

    it("throws if the value is not a number", () => {
      const string = "Hello World";

      expect(() => {
        asNumberOrThrows(string);
      }).toThrow();
    });
  });

  describe("asINamedContentOrNull", () => {
    it("returns the object if it matches INamedContent", () => {
      const content = {
        hasValidName: "valid.name",
        name: "name",
      };

      expect(asINamedContentOrNull(content)).toBe(content);
    });

    it("returns null if the object does not match INamedContent", () => {
      const content1 = {
        hasValidName: "valid.name",
        key: "name",
      };

      const content2 = {
        key: "valid.name",
        name: "name",
      };

      const content3 = {
        name: "name",
      };

      const content4 = {};

      expect(asINamedContentOrNull(content1)).toBeNull();
      expect(asINamedContentOrNull(content2)).toBeNull();
      expect(asINamedContentOrNull(content3)).toBeNull();
      expect(asINamedContentOrNull(content4)).toBeNull();
    });
  });

  describe("nullIfUndefined", () => {
    it("returns null if the value is undefined", () => {
      let foo;
      expect(nullIfUndefined(foo)).toBeNull();
    });

    it("returns the value if it is defined", () => {
      const string = "";
      const number = 10;
      const object = {};
      const array = [1, 2];
      const boolean = true;
      const mainClass = new MainClass();

      expect(nullIfUndefined(string)).toBe(string);
      expect(nullIfUndefined(number)).toBe(number);
      expect(nullIfUndefined(object)).toBe(object);
      expect(nullIfUndefined(array)).toBe(array);
      expect(nullIfUndefined(boolean)).toBe(boolean);
      expect(nullIfUndefined(mainClass)).toBe(mainClass);
    });
  });

  describe("isEquatable", () => {
    it("returns true if the type has a function named `Equals`", () => {
      expect(isEquatable(new MainClass())).toBe(true);
      expect(isEquatable(new SubClass())).toBe(true);
    });

    it("returns false if the type doesn't have a function named `Equals`", () => {
      expect(isEquatable(new OtherClass())).toBe(false);
      expect(isEquatable(2)).toBe(false);
      expect(isEquatable("")).toBe(false);
      expect(isEquatable(true)).toBe(false);
      expect(isEquatable({})).toBe(false);
      expect(isEquatable([])).toBe(false);
      expect(isEquatable(null)).toBe(false);
    });
  });
});
