// Exact pinned NonStrictTypeChecker.test.cpp:106 fixture literal, including boundary LFs.
// This is setup source, not a reconstructed expected result.
export const nonStrictDefinitions = `
@checked declare function abs(n: number): number
@checked declare function lower(s: string): string
declare function cond() : boolean
@checked declare function contrived(n : Not<number>) : number

-- interesting types of things that we would like to mark as checked
@checked declare function onlyNums(...: number) : number
@checked declare function mixedArgs(x: string, ...: number) : number
@checked declare function optionalArg(x: string?) : number
declare foo: {
    bar: @checked (number) -> number,
}

@checked declare function optionalArgsAtTheEnd1(x: string, y: number?, z: number?) : number
@checked declare function optionalArgsAtTheEnd2(x: string, y: number?, z: string) : number

type DateTypeArg = {
    year: number,
    month: number,
    day: number,
    hour: number?,
    min: number?,
    sec: number?,
    isdst: boolean?,
}

declare os : {
    time: @checked (time: DateTypeArg?) -> number
}

@checked declare function require(target : any) : any
@checked declare function getAllTheArgsWrong(one: string, two: number, three: boolean) : any
`;

// Exact TypeFunction.user.test.cpp:52 udtf_nil_methods_work check literal.
export const nilTypeFunctionSource = `
        type function getnil()
            local ty = types.singleton(nil)
            if ty:is("nil") then
                return ty
            end
            -- this should never be returned
            return types.string
        end
        local function ok(idx: getnil<>): nil return idx end
    `;

// Exact TypeInfer.builtins.test.cpp string_format_report_all_type_errors_at_correct_positions.
export const stringFormatMismatchSource = `
        ("%s%d%s"):format(1, "hello", true)
        string.format("%s%d%s", 1, "hello", true)
    `;

// Exact ordered direct loads, TypeInfer.definitions.test.cpp:80.
export const parsePollutionDefinition = `
        declare foo
    `;
// Exact TypeInfer.definitions.test.cpp537 and the three audited dependency
// exclusions; their source SHA/provenance records live only in classDependencyExclusions.
export const externModuleDefinition = `
        declare extern type Foo with
        end
    `;
export const importedClassDependencySource = `
        export class Point
            public x: number
        end
    `;
export const importedClassEntrySource = `
        local A = require(game.A)

        local x : unknown = (A.Point.new { x = 0 } ) :: any
        if class.isinstance(x, A.Point) then
            local y = x
        end
    `;
export const exportedClassDependencySource = `
        export class Point
            public x: number
            public y: number

            function __tostring(self): string
                return \`Point x={self.x} y={self.y}\`
            end
        end
    `;
export const nonExportedClassDependencySource = `
        class Point
            public x: number
            public y: number

            function __tostring(self): string
                return \`Point x={self.x} y={self.y}\`
            end
        end

        return {Point=Point}
    `;
export const checkPollutionDefinition = `
        local foo: string = 123
        declare bar: typeof(foo)
    `;

export const documentationDefinition = `
        declare x: string

        export type Foo = string | number

        declare extern type Bar with
            prop: string
        end

        declare y: {
            x: number,
        }
    `;
export const persistentDocumentationDefinition = `
        export type Evil = string
    `;
export const duplicatePropertyDefinition = `
        declare extern type A with
            X: number
            X: string
        end
    `;
export const nonClassSuperclassDefinition = `
        type NotAClass = {}

        declare extern type Foo extends NotAClass with
        end
    `;
export const cyclicSuperclassDefinition = `
        declare extern type Foo extends Bar with
        end

        declare extern type Bar extends Foo with
        end
    `;

// Exact pinned check literals. These remain separate from Sparkdown AST inputs.
export const cyclicUnionSource = `
        function f(x: BadCyclicUnion)
            return x[0]
        end
    `;
export const asymmetricExternSource = `
        script.Parent.Part.BrickColor = 0xFFFFFF
        script.Parent.Part.Parent = script
    `;
export const externMethodSource = `
        local m = BaseClass.StaticMethod()
    `;
export const recursiveDefinitionSource = `
        declare extern type MyClass with
            function myMethod(self)
        end

        declare function myFunc(): MyClass
    `;
export const nonTestableSource = `
os.time({year = 0, month = 0, day = 0, min = 0, isdst = nil})
`;
export const nonStrictModuleA = `
--!strict
type t = {x : number}
local e : t = {x = 3}
return e
`;
export const nonStrictModuleB = `
--!nonstrict
local E = require(script.Parent.A)
`;
export const negationFirstSource = `
local x = 3
abs(x)
abs(x)
`;
export const negationSecondSource = `
local x = 3
contrived(x)
contrived(x)
			      `;
export const genericSource = `
        function id<a>(x:a): a
            return x
        end
        local x: string = id("hi")
        local y: number = id(37)
    `;
export const generalSource = "local a = 7";
export const tableSource = 'local t = {foo = "bar", baz = 9, quux = nil}';
export const overloadSource = `
        type A = (number) -> string
        type B = (string) -> number

        local function foo(f: A & B)
            return f(1), f("five")
        end
    `;
export const refinementSource = `
        local t: {string} = {"a", "b", "c"}
        local v = t[4]
        if not v then
            t[4] = "d"
        else
            print(v)
        end
    `;
export const positionRefinementSource = `
        function f(v: string?)
            if v then
                local s = v
            else
                local s = v
            end
        end
    `;
export const matchingOverloadSource = `
        type Overload = ((string) -> string) & ((number) -> number)
        local abc: Overload
        abc(1)
    `;
export const mixedPolaritySource = `
        local f: <T>(T) -> T = nil :: any
    `;
export const variadicSource = `
        --!strict

        foo(1, 2, 3, "foo")
        bar(1, "foo", "bar", 3)
    `;
export const clearFirstSource = `
        function string.len(): number
            return 1
        end

        local s = string
    `;
export const clearSecondSource = `
        print(string.len('hello'))
    `;
export const hiddenFunctionSource = `
        function foo(f: fun) end

        function a() end
        function id(x) return x end

        foo(a)
        foo(id)
        foo(foo)
    `;
export const instantiatedFirstSource = `
type Packed<T...> = (T...) -> T...
local a: Packed<>
local b: Packed<number>
local c: Packed<string, number>
    `;
export const instantiatedSecondSource = `
-- (U..., T) cannot be parsed right now
type Packed<T, U...> = { f: (a: T, U...) -> (T, U...) }
local a: Packed<number>
local b: Packed<string, number>
local c: Packed<string, number, boolean>
    `;
export const cycleModuleA = `
        --!strict
        local module = {}

        function module.foo()
            return 2
        end

        function module.bar()
            local m = require(game.B)
            return m.foo() + 1
        end

        return module
    `;
export const cycleModuleB = `
        --!strict
        local module = {}

        function module.foo()
            return 2
        end

        function module.bar()
            local m = require(game.A)
            return m.foo() + 1
        end

        return module
    `;
export const graphCountSource = `
        ("foo")
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
            :lower()
    `;
export const explicitNewSource = `
local function ExitSeat(player, character, seat, weld)
    --Find vehicle model
    local model
    local newParent = seat
    repeat
        model = newParent
        newParent = model.Parent
    until newParent.ClassName ~= "Model"
    local part, _ = Raycast(seat.Position, dir, dist, {character, model})
end
`;
export const noLossyFunctionSource = `
        --!strict
        local tbl = {}
        function tbl:abc(a: number, b: number)
            return a
        end
        tbl:abc(1, 2) -- Line 6
        --   | Column 14
    `;
export const decoratedSource = `
        local s='str'
        local t={a=1,b=false}
        local function fn()
            return 10
        end
    `;
export const decoratedExpected = `
        local s:string='str'
        local t:{a:number,b:boolean}={a=1,b=false}
        local function fn(): number
            return 10
        end
    `;
export const incorrectGenericCountSource = `
        type Callback<A, R> = (A) -> (boolean, R)
        local a: Callback<number, number, string> = function(i) return true, 4 end
    `;
export const duplicateGenericSource = `
        type Oopsies<T, T> = {a: T, b: T}
    `;
export const missingPropertiesSource = `
        type Thing = { name: string, prop: boolean }

        local arrayOfThings : {Thing} = {
            { name = "a" }
        }

        local dictOfThings : {[string]: Thing} = {
            a = { name = "a" }
        }
    `;
export const detailedPropertySource = `
type AS = { x: number, y: number }
type BS = { x: number, y: string }

type A = { a: boolean, b: AS }
type B = { a: boolean, b: BS }

local a: A = { a = false, b = { x = 123, y = 456 } }
local b: B = a
    `;
export const badMetatableTypeFunctionSource = `
        type function badmetatable()
            return types.newtable(nil, nil, types.number)
        end
        local function bad(arg: badmetatable<>) end
    `;
export const normalizeRefinementSource = `
        local function f(a, b: string?)
            if a == b then
                local foo, bar = a, b
            end
        end
    `;
export const instanceRefinementSource = `
        local function f(x: Instance)
            if x:IsA("Folder") then
                local foo = x
            elseif typeof(x) == "table" then
                local foo = x
            end
        end
    `;
export const folderPartRefinementSource = `
        local function f(x: Part | Folder)
            if x:IsA("Folder") then
                local foo = x
            else
                local foo = x
            end
        end
    `;
export const inferredGenericAnnotationSource = `
        export function id(x)
            return x
        end
    `;
export const aliasScopeLocationsSource = `
        type T = number

        do
            type T = string
            type X = boolean
        end
    `;
export const exportedAliasLocationSource = `
        export type Value = string
    `;
export const exportedTypeFunctionLocationSource = `
        export type function Apply()
        end
    `;

// Exact selected-new data assertions in pinned TypeInfer.singletons.test.cpp268.
export const immutableUnionTagSource = `
        type Dog = { tag: "Dog", howls: boolean }
        type Cat = { tag: "Cat", meows: boolean }
        type Animal = Dog | Cat
        local a: Animal = { tag = "Cat", meows = true }
        a.tag = "Dog"
    `;

// Exact optional previousLocation assertion, TypeInfer.aliases.test.cpp445.
export const duplicateAliasLocationSource = `
        type A = string
        type B = number
        type C = string
        type B = number
    `;

// Exact TypeInfer.unionTypes.test.cpp allow_specific_assign literal.
export const specificUnionAssignmentSource = `
        local a:number|string = 22
    `;

export const emptyClassSource = " class Point end ";
export const negatedStringSubtypeSource = `
        function foo(arg: string) end
        local a: string & Not<"Hello">
        foo(a)
    `;
export const negatedStringNotSubtypeSource = `
        function foo(arg: string & Not<"hello">) end
        local a: string
        foo(a)
    `;
export const mismatchingFunctionAritySource = `
        local a: (number) -> ()
        local b: () -> ()

        local c: () -> number
    `;
export const interfaceArenaSource = `
        export type A = {field: number}

        local n: A = {field = 551}

        return {n=n}
    `;
export const genericAliasArenaSource = `
        export type Array<T> = { [number]: T }
    `;
export const clonedInterfaceSource = `
        export type Record = { name: string, location: string }
        local a: Record = { name="Waldo", location="?????" }
        local b: Record = { name="Santa Claus", location="Maui" } -- FIXME

        return {a=a, b=b}
    `;
export const anyPackPrintSource = `
        --!nonstrict

        function Test(a)
            return 1, ""
        end


        local tab = {}
        table.insert(tab, Test(1));
    `;
