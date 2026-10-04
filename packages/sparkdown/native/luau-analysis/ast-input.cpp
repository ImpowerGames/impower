#include "ast-input.h"
#include "Luau/Ast.h"
#include "Luau/Allocator.h"
#include "Luau/Frontend.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <vector>

namespace SparkdownAnalysis {
namespace {
const std::string anyName = std::string(1, char(1)) + "sparkdown:any";
const std::string stringName = std::string(1, char(1)) + "sparkdown:string";
// This parses the bounded transfer envelope, never Luau or Sparkdown source.
struct Json {
    enum Kind { Null, Boolean, Number, String, Array, Object } kind = Null;
    bool boolean = false;
    double number = 0;
    std::string string;
    std::vector<Json> array;
    std::map<std::string, Json> object;
    int compactTag = -1;
    const Json* layout = nullptr;
    bool localRecord = false;
    static const std::vector<std::string>& localFields() {
        static const std::vector<std::string> fields{"name", "location", "shadow", "functionDepth", "loopDepth", "annotation", "isConst", "isExported"};
        return fields;
    }
    static const Json& word(const std::string& word) {
        static const std::map<std::string, Json> words = [] {
            std::map<std::string, Json> result;
            for (const char* value : {"absent", "number", "node", "local", "position", "range", "array", "record", "nan", "infinity", "-infinity", "-zero"}) {
                Json json; json.kind = String; json.string = value; result.emplace(value, std::move(json));
            }
            return result;
        }();
        return words.at(word);
    }
    const Json& at(const std::string& key) const {
        if (layout) {
            if (key == "kind") return layout->array[0];
            if (key == "fields") return *this;
            for (size_t i = 1; i < layout->array.size(); ++i)
                if (layout->array[i].string == key) return array[i + 4];
        } else if (localRecord) {
            const auto& names = localFields();
            for (size_t i = 0; i < names.size(); ++i) if (names[i] == key) return array[i];
        } else if (compactTag >= 0) {
            if (key == "tag") {
                static const char* tags[]{"absent", "number", "node", "local", "position", "range", "array", "record"};
                return word(tags[compactTag]);
            }
            if (key == "id" && (compactTag == 2 || compactTag == 3)) return array[1];
            if (key == "line" && compactTag == 4) return array[1];
            if (key == "column" && compactTag == 4) return array[2];
            if (key == "values" && compactTag == 6) return *this;
            if (key == "fields" && compactTag == 7) return *this;
            if (key == "value" && compactTag == 1) {
                static const char* numbers[]{"nan", "infinity", "-infinity", "-zero"};
                return word(numbers[size_t(array[1].number)]);
            }
            if (compactTag == 7)
                for (size_t i = 1; i < array.size(); ++i) if (array[i].array[0].string == key) return array[i].array[1];
        }
        auto it = object.find(key);
        if (kind != Object || it == object.end()) throw std::runtime_error("Missing AST field " + key);
        return it->second;
    }
    bool has(const std::string& key) const {
        if (layout) {
            if (key == "kind" || key == "fields") return true;
            for (size_t i = 1; i < layout->array.size(); ++i) if (layout->array[i].string == key) return true;
            return false;
        }
        if (localRecord) return std::find(localFields().begin(), localFields().end(), key) != localFields().end();
        if (compactTag == 7) {
            for (size_t i = 1; i < array.size(); ++i) if (array[i].array[0].string == key) return true;
            return false;
        }
        return object.count(key) != 0;
    }
};
class Reader {
    std::string_view input;
    size_t index = 0, records = 0;
    char take() { if (index == input.size()) throw std::runtime_error("Truncated AST JSON"); return input[index++]; }
    void whitespace() { while (index < input.size() && (input[index] == ' ' || input[index] == '\n' || input[index] == '\r' || input[index] == '\t')) ++index; }
    void expect(char c) { if (take() != c) throw std::runtime_error("Invalid AST JSON punctuation"); }
    unsigned hex() {
        unsigned value = 0;
        for (int i = 0; i < 4; ++i) {
            char c = take();
            int digit = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
            if (digit < 0) throw std::runtime_error("Invalid AST JSON escape");
            value = value * 16 + unsigned(digit);
        }
        return value;
    }
    static void utf8(std::string& out, unsigned cp) {
        if (cp < 0x80) out += char(cp);
        else if (cp < 0x800) { out += char(0xc0 | cp >> 6); out += char(0x80 | (cp & 63)); }
        else if (cp < 0x10000) { out += char(0xe0 | cp >> 12); out += char(0x80 | ((cp >> 6) & 63)); out += char(0x80 | (cp & 63)); }
        else { out += char(0xf0 | cp >> 18); out += char(0x80 | ((cp >> 12) & 63)); out += char(0x80 | ((cp >> 6) & 63)); out += char(0x80 | (cp & 63)); }
    }
    std::string string() {
        expect('"');
        std::string out;
        for (;;) {
            unsigned char c = take();
            if (c == '"') return out;
            if (c < 32) throw std::runtime_error("Invalid AST JSON string");
            if (c != '\\') { out += char(c); continue; }
            char escape = take();
            switch (escape) {
                case '"': case '\\': case '/': out += escape; break;
                case 'b': out += char(8); break; case 'f': out += char(12); break;
                case 'n': out += '\n'; break; case 'r': out += '\r'; break; case 't': out += '\t'; break;
                case 'u': {
                    unsigned cp = hex();
                    if (cp >= 0xd800 && cp <= 0xdbff) {
                        expect('\\'); expect('u');
                        unsigned low = hex();
                        if (low < 0xdc00 || low > 0xdfff) throw std::runtime_error("Invalid AST JSON surrogate");
                        cp = 0x10000 + ((cp - 0xd800) << 10) + low - 0xdc00;
                    } else if (cp >= 0xdc00 && cp <= 0xdfff) throw std::runtime_error("Invalid AST JSON surrogate");
                    utf8(out, cp); break;
                }
                default: throw std::runtime_error("Invalid AST JSON escape");
            }
        }
    }
    Json read(unsigned depth) {
        if (depth > 128 || ++records > 2000000) throw std::runtime_error("AST JSON resource limit");
        whitespace();
        if (index == input.size()) throw std::runtime_error("Truncated AST JSON");
        Json result;
        char c = input[index];
        if (c == '"') { result.kind = Json::String; result.string = string(); }
        else if (c == '[') {
            result.kind = Json::Array; ++index; whitespace();
            if (index < input.size() && input[index] == ']') ++index;
            else for (;;) { result.array.push_back(read(depth + 1)); whitespace(); c = take(); if (c == ']') break; if (c != ',') throw std::runtime_error("Invalid AST JSON array"); }
        } else if (c == '{') {
            result.kind = Json::Object; ++index; whitespace();
            if (index < input.size() && input[index] == '}') ++index;
            else for (;;) {
                whitespace(); auto key = string(); whitespace(); expect(':');
                if (!result.object.emplace(key, read(depth + 1)).second) throw std::runtime_error("Duplicate AST JSON key");
                whitespace(); c = take(); if (c == '}') break; if (c != ',') throw std::runtime_error("Invalid AST JSON object");
            }
        } else if (input.substr(index, 4) == "null") index += 4;
        else if (input.substr(index, 4) == "true") { index += 4; result.kind = Json::Boolean; result.boolean = true; }
        else if (input.substr(index, 5) == "false") { index += 5; result.kind = Json::Boolean; }
        else {
            result.kind = Json::Number;
            size_t start = index;
            if (input[index] == '-') ++index;
            if (index == input.size() || input[index] < '0' || input[index] > '9') throw std::runtime_error("Invalid AST JSON number");
            if (input[index] == '0') ++index;
            else while (index < input.size() && input[index] >= '0' && input[index] <= '9') ++index;
            if (index < input.size() && input[index] == '.') {
                ++index; size_t digits = index;
                while (index < input.size() && input[index] >= '0' && input[index] <= '9') ++index;
                if (digits == index) throw std::runtime_error("Invalid AST JSON fraction");
            }
            if (index < input.size() && (input[index] == 'e' || input[index] == 'E')) {
                ++index; if (index < input.size() && (input[index] == '+' || input[index] == '-')) ++index;
                size_t digits = index;
                while (index < input.size() && input[index] >= '0' && input[index] <= '9') ++index;
                if (digits == index) throw std::runtime_error("Invalid AST JSON exponent");
            }
            result.number = std::stod(std::string(input.substr(start, index - start)));
        }
        return result;
    }
public:
    explicit Reader(std::string_view input) : input(input) { if (input.size() > 16 * 1024 * 1024) throw std::runtime_error("AST input byte limit"); }
    Json parse() { auto result = read(0); whitespace(); if (index != input.size()) throw std::runtime_error("Trailing AST JSON"); return result; }
};
std::string text(const Json& j) { if (j.kind != Json::String) throw std::runtime_error("Expected AST string"); return j.string; }
bool boolean(const Json& j) { if (j.kind != Json::Boolean) throw std::runtime_error("Expected AST boolean"); return j.boolean; }
size_t integer(const Json& j, size_t maximum = 0xffffffff) {
    if (j.kind != Json::Number || !std::isfinite(j.number) || j.number < 0 || j.number > double(maximum) || std::floor(j.number) != j.number) throw std::runtime_error("Expected AST integer");
    return size_t(j.number);
}
bool absent(const Json& j) { return j.compactTag == 0 || (j.kind == Json::Object && j.has("tag") && text(j.at("tag")) == "absent"); }
struct ArrayView {
    const std::vector<Json>& values;
    size_t offset = 0;
    auto begin() const { return values.begin() + offset; }
    auto end() const { return values.end(); }
    size_t size() const { return values.size() - offset; }
    bool empty() const { return size() == 0; }
    const Json& operator[](size_t index) const { return values[index + offset]; }
};
ArrayView array(const Json& j) { if (j.kind != Json::Array) throw std::runtime_error("Expected AST array"); return {j.array, j.compactTag == 6 ? size_t(1) : size_t(0)}; }
const Json& field(const Json& j, const std::string& name) { return j.at("fields").at(name); }
Luau::Position pairPosition(const Json& j) {
    const auto& a = array(j); if (a.size() != 2) throw std::runtime_error("Expected AST position pair");
    return Luau::Position(unsigned(integer(a[0])), unsigned(integer(a[1])));
}
Luau::Position positionValue(const Json& j) {
    if (j.compactTag == 4) return Luau::Position(integer(j.array[1]), integer(j.array[2]));
    if (text(j.at("tag")) != "position") throw std::runtime_error("Expected AST position");
    return Luau::Position(integer(j.at("line")), integer(j.at("column")));
}
Luau::Location location(const Json& j) {
    if (j.compactTag == 5 || j.layout)
        return Luau::Location(Luau::Position(integer(j.array[1]), integer(j.array[2])), Luau::Position(integer(j.array[3]), integer(j.array[4])));
    return Luau::Location(pairPosition(j.at("begin")), pairPosition(j.at("end")));
}
Luau::Location rangeField(const Json& j, const std::string& key) { return location(field(j, key)); }
std::optional<Luau::Location> optionalLocation(const Json& j) { return absent(j) ? std::nullopt : std::optional<Luau::Location>(location(j)); }
double number(const Json& j) {
    if (j.kind == Json::Number) return j.number;
    if (text(j.at("tag")) != "number") throw std::runtime_error("Expected AST numeric constant");
    auto value = text(j.at("value"));
    if (value == "nan") return std::numeric_limits<double>::quiet_NaN();
    if (value == "infinity") return std::numeric_limits<double>::infinity();
    if (value == "-infinity") return -std::numeric_limits<double>::infinity();
    if (value == "-zero") return -0.0;
    throw std::runtime_error("Invalid AST numeric constant");
}
// The TS converter represents Luau literal bytes as Latin1 code units. The
// JSON transport represents those code units in UTF8; recover each byte once.
std::string literalBytes(const std::string& utf8) {
    std::string out;
    for (size_t i = 0; i < utf8.size();) {
        unsigned c = static_cast<unsigned char>(utf8[i++]);
        if (c < 0x80) out += char(c);
        else if ((c & 0xe0) == 0xc0 && i < utf8.size()) {
            unsigned low = static_cast<unsigned char>(utf8[i++]);
            unsigned cp = ((c & 31) << 6) | (low & 63);
            if ((low & 0xc0) != 0x80 || cp < 0x80 || cp > 255) throw std::runtime_error("Invalid AST byte string");
            out += char(cp);
        } else throw std::runtime_error("Invalid AST byte string");
    }
    return out;
}
const std::map<std::string, std::vector<std::string>>& supportedFields() {
    static const std::map<std::string, std::vector<std::string>> fields{
        {"StatBlock", {"body", "hasEnd", "hasSemicolon"}},
        {"StatReturn", {"list", "hasSemicolon"}},
        {"StatExpr", {"expr", "hasSemicolon"}},
        {"StatLocal", {"vars", "values", "equalsSignLocation", "isConst", "isExported", "keywordLocation", "hasSemicolon"}},
        {"StatTypeFunction", {"name", "nameLocation", "body", "exported", "hasErrors", "hasSemicolon"}},
        {"StatTypeAlias", {"name", "nameLocation", "generics", "genericPacks", "type", "exported", "hasSemicolon"}},
        {"StatFunction", {"name", "func", "hasSemicolon"}},
        {"StatLocalFunction", {"name", "func", "isConst", "constKeywordBegin", "hasSemicolon"}},
        {"StatIf", {"condition", "thenbody", "elsebody", "thenLocation", "elseLocation", "hasSemicolon"}},
        {"StatWhile", {"condition", "body", "hasDo", "doLocation", "hasSemicolon"}},
        {"StatRepeat", {"condition", "body", "hasSemicolon"}},
        {"StatBreak", {"hasSemicolon"}}, {"StatContinue", {"hasSemicolon"}},
        {"StatFor", {"variable", "from", "to", "step", "body", "hasDo", "doLocation", "hasSemicolon"}},
        {"StatForIn", {"vars", "values", "body", "hasIn", "inLocation", "hasDo", "doLocation", "hasSemicolon"}},
        {"StatAssign", {"vars", "values", "hasSemicolon"}},
        {"StatCompoundAssign", {"op", "variable", "value", "hasSemicolon"}},
        {"StatDeclareGlobal", {"name", "nameLocation", "type", "hasSemicolon"}},
        {"StatDeclareFunction", {"attributes", "name", "nameLocation", "generics", "genericPacks", "params", "paramNames", "vararg", "varargLocation", "retTypes", "hasSemicolon"}},
        {"StatDeclareExternType", {"name", "superName", "props", "indexer", "hasSemicolon"}},
        {"StatError", {"expressions", "statements", "messageIndex", "hasSemicolon"}},
        {"ExprConstantNil", {}}, {"ExprConstantBool", {"value"}},
        {"ExprConstantNumber", {"value", "malformed"}}, {"ExprConstantString", {"value", "quoteStyle"}},
        {"ExprLocal", {"local", "upvalue"}}, {"ExprGlobal", {"name"}}, {"ExprVarargs", {}}, {"ExprGroup", {"expr"}},
        {"ExprCall", {"func", "args", "self", "typeArguments", "argLocation"}},
        {"ExprIndexName", {"expr", "index", "indexLocation", "opPosition", "op"}}, {"ExprIndexExpr", {"expr", "index"}},
        {"ExprTable", {"items"}}, {"ExprTypeAssertion", {"expr", "annotation"}},
        {"ExprUnary", {"op", "expr"}}, {"ExprBinary", {"op", "left", "right"}},
        {"ExprIfElse", {"condition", "hasThen", "trueExpr", "hasElse", "falseExpr"}},
        {"ExprInterpString", {"strings", "expressions"}}, {"ExprInstantiate", {"expr", "typeArguments"}},
        {"Attr", {"type", "args", "name"}},
        {"ExprError", {"expressions", "messageIndex"}},
        {"ExprFunction", {"attributes", "generics", "genericPacks", "self", "args", "vararg", "varargLocation", "body", "functionDepth", "debugname", "returnAnnotation", "varargAnnotation", "argLocation"}},
        {"TypeReference", {"prefix", "name", "prefixLocation", "nameLocation", "hasParameterList", "parameters", "prefixLocal"}},
        {"TypePackExplicit", {"typeList"}}, {"TypePackVariadic", {"variadicType"}}, {"TypePackGeneric", {"genericName"}},
        {"TypeSingletonString", {"value"}}, {"TypeSingletonBool", {"value"}},
        {"TypeTable", {"props", "indexer"}},
        {"TypeFunction", {"attributes", "generics", "genericPacks", "argTypes", "argNames", "returnTypes"}},
        {"TypeTypeof", {"expr"}}, {"TypeOptional", {}},
        {"TypeUnion", {"types"}}, {"TypeIntersection", {"types"}}, {"TypeGroup", {"type"}},
        {"TypeError", {"types", "isMissing", "messageIndex"}},
        {"GenericType", {"name", "defaultValue"}}, {"GenericTypePack", {"name", "defaultValue"}}
        , {"SparkdownDivertTarget", {"path"}}, {"SparkdownRegex", {"pattern", "flags"}},
        {"SparkdownConditionalAlternator", {}}, {"SparkdownSequentialAlternator", {}},
        {"SparkdownNew", {"className", "classNameLocation", "args", "hasArgs"}},
        {"SparkdownCallShorthand", {"expr"}}, {"SparkdownInterpString", {"strings", "expressions", "luauValue"}},
        {"SparkdownFlowArgument", {}}
    };
    return fields;
}
void markCompactValue(Json& j, size_t depth = 0) {
    if (depth > 128) throw std::runtime_error("Compact AST value depth limit");
    if (j.kind != Json::Array) {
        if (j.kind == Json::Object) throw std::runtime_error("Compact AST values must be tagged arrays or scalars");
        return;
    }
    if (j.array.empty()) throw std::runtime_error("Missing compact AST tag");
    const int tag = int(integer(j.array[0], 7));
    static const size_t lengths[]{1, 2, 2, 2, 3, 5, 0, 0};
    if (lengths[tag] && j.array.size() != lengths[tag]) throw std::runtime_error("Invalid compact AST value length");
    if (tag == 1) integer(j.array[1], 3);
    if (tag == 2 || tag == 3) integer(j.array[1]);
    if (tag == 4 || tag == 5) for (size_t i = 1; i < j.array.size(); ++i) integer(j.array[i]);
    if (tag == 6) for (size_t i = 1; i < j.array.size(); ++i) markCompactValue(j.array[i], depth + 1);
    if (tag == 7) {
        std::set<std::string> keys;
        for (size_t i = 1; i < j.array.size(); ++i) {
            auto& pair = j.array[i];
            if (pair.kind != Json::Array || pair.array.size() != 2) throw std::runtime_error("Invalid compact AST record pair");
            if (!keys.insert(text(pair.array[0])).second) throw std::runtime_error("Duplicate compact AST record field");
            markCompactValue(pair.array[1], depth + 1);
        }
    }
    j.compactTag = tag;
}
void markCompact(Json& json) {
    const std::set<std::string> allowed{"schemaVersion", "positionEncoding", "root", "layouts", "nodes", "locals", "errors", "hotcomments", "commentLocations"};
    if (json.kind != Json::Object || json.object.size() != allowed.size()) throw std::runtime_error("Invalid compact AST envelope");
    for (const auto& [key, value] : json.object) if (!allowed.count(key)) throw std::runtime_error("Unknown compact AST envelope field");
    auto& layouts = json.object.at("layouts");
    if (layouts.kind != Json::Array || layouts.array.size() > supportedFields().size()) throw std::runtime_error("Compact AST layout limit");
    std::set<std::string> kinds;
    for (auto& layout : layouts.array) {
        if (layout.kind != Json::Array || layout.array.empty()) throw std::runtime_error("Invalid compact AST layout");
        auto kind = text(layout.array[0]);
        if (!kinds.insert(kind).second) throw std::runtime_error("Duplicate compact AST layout");
        auto expected = supportedFields().find(kind);
        if (expected == supportedFields().end()) throw std::runtime_error("Unsupported native AST constructor " + kind);
        if (layout.array.size() != expected->second.size() + 1) throw std::runtime_error("Invalid compact AST constructor field count");
        for (size_t i = 0; i < expected->second.size(); ++i)
            if (text(layout.array[i + 1]) != expected->second[i]) throw std::runtime_error("Invalid compact AST constructor field order");
    }
    auto& nodes = json.object.at("nodes"); auto& locals = json.object.at("locals");
    if (nodes.kind != Json::Array || locals.kind != Json::Array || nodes.array.size() + locals.array.size() > 100000)
        throw std::runtime_error("Compact AST record limit");
    for (auto& node : nodes.array) {
        if (node.kind != Json::Array || node.array.size() < 5 || layouts.array.empty()) throw std::runtime_error("Invalid compact AST node");
        auto& layout = layouts.array[integer(node.array[0], layouts.array.size() - 1)];
        if (node.array.size() != layout.array.size() + 4) throw std::runtime_error("Invalid compact AST node field count");
        for (size_t i = 1; i <= 4; ++i) integer(node.array[i]);
        for (size_t i = 5; i < node.array.size(); ++i) markCompactValue(node.array[i]);
        node.layout = &layout;
    }
    for (auto& local : locals.array) {
        if (local.kind != Json::Array || local.array.size() != Json::localFields().size()) throw std::runtime_error("Invalid compact AST local");
        for (auto& value : local.array) markCompactValue(value);
        local.localRecord = true;
    }
}
void validateVerbose(const Json& json) {
    const std::set<std::string> allowed{"schemaVersion", "positionEncoding", "root", "nodes", "locals", "errors", "hotcomments", "commentLocations"};
    if (json.kind != Json::Object || json.object.size() != allowed.size()) throw std::runtime_error("Invalid AST envelope");
    for (const auto& [key, value] : json.object) if (!allowed.count(key)) throw std::runtime_error("Unknown AST envelope field");
    for (const auto& node : array(json.at("nodes"))) {
        if (node.kind != Json::Object || node.object.size() != 3 || !node.has("kind") || !node.has("range") || !node.has("fields"))
            throw std::runtime_error("Invalid AST node record");
        const auto kind = text(node.at("kind")); auto expected = supportedFields().find(kind);
        if (expected == supportedFields().end()) throw std::runtime_error("Unsupported native AST constructor " + kind);
        const auto& fields = node.at("fields");
        if (fields.kind != Json::Object || fields.object.size() != expected->second.size()) throw std::runtime_error("Invalid AST constructor fields");
        for (const auto& name : expected->second) if (!fields.has(name)) throw std::runtime_error("Missing AST constructor field " + name);
    }
    for (const auto& local : array(json.at("locals"))) {
        if (local.kind != Json::Object || local.object.size() != Json::localFields().size()) throw std::runtime_error("Invalid AST local fields");
        for (const auto& name : Json::localFields()) if (!local.has(name)) throw std::runtime_error("Missing AST local field " + name);
    }
}
class Decoder {
    Json json;
    std::shared_ptr<Luau::SourceModule> source = std::make_shared<Luau::SourceModule>();
    std::vector<Luau::AstNode*> nodes;
    std::vector<unsigned char> states;
    std::vector<Luau::AstLocal*> locals;
    size_t nodeDepth = 0;
    template<class T> Luau::AstArray<T> copy(const std::vector<T>& values) {
        if (values.empty()) return {nullptr, 0};
        auto data = static_cast<T*>(source->allocator->allocate(values.size() * sizeof(T)));
        std::copy(values.begin(), values.end(), data);
        return {data, values.size()};
    }
    Luau::AstName name(const Json& j) {
        auto s = text(j);
        for (unsigned char c : s) if (c < 32 || c == 127) throw std::runtime_error("Control byte in AST name");
        return source->names->getOrAdd(s.c_str());
    }
    Luau::AstExpr* synthetic(const Luau::Location& location, const std::string& name) {
        return source->allocator->alloc<Luau::AstExprGlobal>(location, source->names->getOrAdd(name.c_str()));
    }
    size_t ref(const Json& j, const char* tag, size_t count) {
        if (text(j.at("tag")) != tag || count == 0) throw std::runtime_error("Invalid AST reference kind");
        return integer(j.at("id"), count - 1);
    }
    Luau::AstLocal* local(const Json& j) { return absent(j) ? nullptr : locals[ref(j, "local", locals.size())]; }
    template<class T> T* node(const Json& j) {
        if (absent(j)) return nullptr;
        auto p = decodeNode(ref(j, "node", nodes.size()));
        T* typed;
        if constexpr (std::is_same_v<T, Luau::AstExpr>) typed = p->asExpr();
        else if constexpr (std::is_same_v<T, Luau::AstStat>) typed = p->asStat();
        else if constexpr (std::is_same_v<T, Luau::AstType>) typed = p->asType();
        else if constexpr (std::is_same_v<T, Luau::AstTypePack>) {
            typed = p->is<Luau::AstTypePackExplicit>() || p->is<Luau::AstTypePackVariadic>() || p->is<Luau::AstTypePackGeneric>() ? static_cast<Luau::AstTypePack*>(p) : nullptr;
        } else typed = p->as<T>();
        if (!typed) throw std::runtime_error("Invalid AST reference type");
        return typed;
    }
    template<class T> Luau::AstArray<T*> nodeArray(const Json& j) {
        if (text(j.at("tag")) != "array") throw std::runtime_error("Expected tagged AST array");
        std::vector<T*> values; for (const auto& item : array(j.at("values"))) values.push_back(node<T>(item));
        return copy(values);
    }
    Luau::AstArray<Luau::AstLocal*> localArray(const Json& j) {
        std::vector<Luau::AstLocal*> values; for (const auto& item : array(j.at("values"))) values.push_back(local(item));
        return copy(values);
    }
    Luau::AstTypeList typeList(const Json& j) {
        const auto& f = j.at("fields");
        return {nodeArray<Luau::AstType>(f.at("types")), f.has("tailType") ? node<Luau::AstTypePack>(f.at("tailType")) : nullptr};
    }
    Luau::AstArray<Luau::AstTypeOrPack> typeOrPacks(const Json& j) {
        std::vector<Luau::AstTypeOrPack> values;
        for (const auto& item : array(j.at("values"))) {
            const auto& f = item.at("fields");
            Luau::AstTypeOrPack value; value.type = f.has("type") ? node<Luau::AstType>(f.at("type")) : nullptr;
            value.typePack = f.has("typePack") ? node<Luau::AstTypePack>(f.at("typePack")) : nullptr; values.push_back(value);
        }
        return copy(values);
    }
    Luau::AstTableAccess access(const Json& j) {
        const auto value = integer(j, 3);
        if (value == 0) throw std::runtime_error("Invalid AST table access");
        return Luau::AstTableAccess(value);
    }
    Luau::AstTableIndexer* indexer(const Json& j) {
        if (absent(j)) return nullptr;
        const auto& f = j.at("fields");
        auto out = source->allocator->alloc<Luau::AstTableIndexer>();
        out->indexType = node<Luau::AstType>(f.at("indexType")); out->resultType = node<Luau::AstType>(f.at("resultType"));
        out->location = location(f.at("location")); out->access = access(f.at("access"));
        out->accessLocation = f.has("accessLocation") ? optionalLocation(f.at("accessLocation")) : std::nullopt;
        return out;
    }
    Luau::AstNode* decodeNode(size_t id) {
        if (states[id] == 2) return nodes[id];
        if (states[id] == 1) throw std::runtime_error("Cyclic AST node graph");
        if (nodeDepth >= 512) throw std::runtime_error("AST node depth limit");
        struct DepthGuard {
            size_t& depth;
            explicit DepthGuard(size_t& depth) : depth(depth) { ++depth; }
            ~DepthGuard() { --depth; }
        } depthGuard(nodeDepth);
        states[id] = 1;
        const auto& j = json.at("nodes").array[id]; const auto kind = text(j.at("kind")); const auto l = j.layout ? location(j) : location(j.at("range"));
        auto f = [&](const char* key) -> const Json& { return field(j, key); };
        auto b = [&](const char* key) { return boolean(f(key)); };
        auto expr = [&](const char* key) { return node<Luau::AstExpr>(f(key)); };
        auto block = [&](const char* key) { return node<Luau::AstStatBlock>(f(key)); };
        auto type = [&](const char* key) { return node<Luau::AstType>(f(key)); };
        auto& a = *source->allocator; Luau::AstNode* out = nullptr;
        if (kind == "StatBlock") out = a.alloc<Luau::AstStatBlock>(l, nodeArray<Luau::AstStat>(f("body")), b("hasEnd"));
        else if (kind == "StatReturn") out = a.alloc<Luau::AstStatReturn>(l, nodeArray<Luau::AstExpr>(f("list")));
        else if (kind == "StatExpr") out = a.alloc<Luau::AstStatExpr>(l, expr("expr"));
        else if (kind == "StatIf") out = a.alloc<Luau::AstStatIf>(l, expr("condition"), block("thenbody"), node<Luau::AstStat>(f("elsebody")), optionalLocation(f("thenLocation")), optionalLocation(f("elseLocation")));
        else if (kind == "StatWhile") out = a.alloc<Luau::AstStatWhile>(l, expr("condition"), block("body"), b("hasDo"), rangeField(j, "doLocation"));
        else if (kind == "StatRepeat") {
            // readLuauAst.parseRepeat records the actual 'until' consumption
            // in body.hasEnd, including incomplete recovery. No new parse or
            // inferred keyword position is needed for this deprecated flag.
            auto body = block("body");
            out = a.alloc<Luau::AstStatRepeat>(l, expr("condition"), body, body->hasEnd);
        }
        else if (kind == "StatBreak") out = a.alloc<Luau::AstStatBreak>(l);
        else if (kind == "StatContinue") out = a.alloc<Luau::AstStatContinue>(l);
        else if (kind == "StatFor") out = a.alloc<Luau::AstStatFor>(l, local(f("variable")), expr("from"), expr("to"), expr("step"), block("body"), b("hasDo"), rangeField(j, "doLocation"));
        else if (kind == "StatForIn") out = a.alloc<Luau::AstStatForIn>(l, localArray(f("vars")), nodeArray<Luau::AstExpr>(f("values")), block("body"), b("hasIn"), rangeField(j, "inLocation"), b("hasDo"), rangeField(j, "doLocation"));
        else if (kind == "StatAssign") out = a.alloc<Luau::AstStatAssign>(l, nodeArray<Luau::AstExpr>(f("vars")), nodeArray<Luau::AstExpr>(f("values")));
        else if (kind == "StatCompoundAssign") out = a.alloc<Luau::AstStatCompoundAssign>(l, Luau::AstExprBinary::Op(integer(f("op"), Luau::AstExprBinary::Op__Count - 1)), expr("variable"), expr("value"));
        else if (kind == "StatDeclareGlobal") out = a.alloc<Luau::AstStatDeclareGlobal>(l, name(f("name")), rangeField(j, "nameLocation"), type("type"));
        else if (kind == "StatDeclareFunction") {
            std::vector<Luau::AstArgumentName> names;
            for (const auto& item : array(f("paramNames").at("values"))) {
                const auto& p = item.at("fields"); names.push_back({name(p.at("name")), location(p.at("location"))});
            }
            out = a.alloc<Luau::AstStatDeclareFunction>(l, nodeArray<Luau::AstAttr>(f("attributes")), name(f("name")), rangeField(j, "nameLocation"), nodeArray<Luau::AstGenericType>(f("generics")), nodeArray<Luau::AstGenericTypePack>(f("genericPacks")), typeList(f("params")), copy(names), b("vararg"), rangeField(j, "varargLocation"), node<Luau::AstTypePack>(f("retTypes")));
        }
        else if (kind == "StatDeclareExternType") {
            std::vector<Luau::AstDeclaredExternTypeProperty> props;
            for (const auto& item : array(f("props").at("values"))) {
                const auto& p = item.at("fields"); props.push_back({name(p.at("name")), location(p.at("nameLocation")), node<Luau::AstType>(p.at("ty")), boolean(p.at("isMethod")), location(p.at("location")), access(p.at("access"))});
            }
            std::optional<Luau::AstName> super = absent(f("superName")) ? std::nullopt : std::optional<Luau::AstName>(name(f("superName")));
            out = a.alloc<Luau::AstStatDeclareExternType>(l, name(f("name")), super, copy(props), indexer(f("indexer")));
        }
        else if (kind == "StatError") out = a.alloc<Luau::AstStatError>(l, nodeArray<Luau::AstExpr>(f("expressions")), nodeArray<Luau::AstStat>(f("statements")), integer(f("messageIndex")));
        else if (kind == "StatLocal") {
            auto stat = a.alloc<Luau::AstStatLocal>(l, localArray(f("vars")), nodeArray<Luau::AstExpr>(f("values")), optionalLocation(f("equalsSignLocation")), b("isConst"));
            stat->isExported = b("isExported"); stat->keywordLocation = optionalLocation(f("keywordLocation")); out = stat;
        } else if (kind == "StatTypeFunction") out = a.alloc<Luau::AstStatTypeFunction>(l, name(f("name")), rangeField(j, "nameLocation"), node<Luau::AstExprFunction>(f("body")), b("exported"), b("hasErrors"));
        else if (kind == "StatTypeAlias") out = a.alloc<Luau::AstStatTypeAlias>(l, name(f("name")), rangeField(j, "nameLocation"), nodeArray<Luau::AstGenericType>(f("generics")), nodeArray<Luau::AstGenericTypePack>(f("genericPacks")), type("type"), b("exported"));
        else if (kind == "StatFunction") out = a.alloc<Luau::AstStatFunction>(l, expr("name"), node<Luau::AstExprFunction>(f("func")));
        else if (kind == "StatLocalFunction") {
            auto keyword = positionValue(f("constKeywordBegin"));
            if (b("isConst") == (keyword == Luau::Position::missing())) throw std::runtime_error("Invalid const function keyword metadata");
            out = a.alloc<Luau::AstStatLocalFunction>(l, local(f("name")), node<Luau::AstExprFunction>(f("func")), b("isConst"), keyword);
        }
        else if (kind == "ExprConstantNil") out = a.alloc<Luau::AstExprConstantNil>(l);
        else if (kind == "ExprConstantBool") out = a.alloc<Luau::AstExprConstantBool>(l, b("value"));
        else if (kind == "ExprConstantNumber") out = a.alloc<Luau::AstExprConstantNumber>(l, number(f("value")), b("malformed") ? Luau::ConstantNumberParseResult::Malformed : Luau::ConstantNumberParseResult::Ok);
        else if (kind == "ExprConstantString") {
            auto bytes = literalBytes(text(f("value"))); std::vector<char> chars(bytes.begin(), bytes.end());
            out = a.alloc<Luau::AstExprConstantString>(l, copy(chars), Luau::AstExprConstantString::QuoteStyle(integer(f("quoteStyle"), 3)));
        } else if (kind == "ExprLocal") out = a.alloc<Luau::AstExprLocal>(l, local(f("local")), b("upvalue"));
        else if (kind == "ExprGlobal") out = a.alloc<Luau::AstExprGlobal>(l, name(f("name")));
        else if (kind == "ExprVarargs") out = a.alloc<Luau::AstExprVarargs>(l);
        else if (kind == "ExprGroup") out = a.alloc<Luau::AstExprGroup>(l, expr("expr"));
        else if (kind == "ExprCall") out = a.alloc<Luau::AstExprCall>(l, expr("func"), nodeArray<Luau::AstExpr>(f("args")), b("self"), typeOrPacks(f("typeArguments")), rangeField(j, "argLocation"));
        else if (kind == "ExprIndexName") {
            const auto& p = f("opPosition"); auto op = text(f("op")); if (op != "." && op != ":") throw std::runtime_error("Invalid AST index operator");
            out = a.alloc<Luau::AstExprIndexName>(l, expr("expr"), name(f("index")), rangeField(j, "indexLocation"), Luau::Position(integer(p.at("line")), integer(p.at("column"))), op[0]);
        } else if (kind == "ExprIndexExpr") out = a.alloc<Luau::AstExprIndexExpr>(l, expr("expr"), expr("index"));
        else if (kind == "ExprTable") {
            std::vector<Luau::AstExprTable::Item> items;
            for (const auto& item : array(f("items").at("values"))) {
                const auto& fields = item.at("fields");
                items.push_back({Luau::AstExprTable::Item::Kind(integer(fields.at("kind"), 2)), fields.has("key") ? node<Luau::AstExpr>(fields.at("key")) : nullptr, node<Luau::AstExpr>(fields.at("value"))});
            }
            out = a.alloc<Luau::AstExprTable>(l, copy(items));
        }
        else if (kind == "ExprTypeAssertion") out = a.alloc<Luau::AstExprTypeAssertion>(l, expr("expr"), type("annotation"));
        else if (kind == "ExprUnary") out = a.alloc<Luau::AstExprUnary>(l, Luau::AstExprUnary::Op(integer(f("op"), 2)), expr("expr"));
        else if (kind == "ExprBinary") out = a.alloc<Luau::AstExprBinary>(l, Luau::AstExprBinary::Op(integer(f("op"), Luau::AstExprBinary::Op__Count - 1)), expr("left"), expr("right"));
        else if (kind == "ExprIfElse") out = a.alloc<Luau::AstExprIfElse>(l, expr("condition"), b("hasThen"), expr("trueExpr"), b("hasElse"), expr("falseExpr"));
        else if (kind == "ExprInterpString") {
            std::vector<Luau::AstArray<char>> strings;
            for (const auto& item : array(f("strings").at("values"))) {
                auto bytes = literalBytes(text(item)); strings.push_back(copy(std::vector<char>(bytes.begin(), bytes.end())));
            }
            auto expressions = nodeArray<Luau::AstExpr>(f("expressions"));
            if (strings.size() != expressions.size + 1) throw std::runtime_error("Invalid AST interpolated string parts");
            out = a.alloc<Luau::AstExprInterpString>(l, copy(strings), expressions);
        }
        else if (kind == "ExprInstantiate") out = a.alloc<Luau::AstExprInstantiate>(l, expr("expr"), typeOrPacks(f("typeArguments")));
        else if (kind == "Attr") out = a.alloc<Luau::AstAttr>(l, Luau::AstAttr::Type(integer(f("type"), 4)), nodeArray<Luau::AstExpr>(f("args")), name(f("name")));
        else if (kind == "ExprError") out = a.alloc<Luau::AstExprError>(l, nodeArray<Luau::AstExpr>(f("expressions")), integer(f("messageIndex")));
        else if (kind == "ExprFunction") out = a.alloc<Luau::AstExprFunction>(l, nodeArray<Luau::AstAttr>(f("attributes")), nodeArray<Luau::AstGenericType>(f("generics")), nodeArray<Luau::AstGenericTypePack>(f("genericPacks")), local(f("self")), localArray(f("args")), b("vararg"), rangeField(j, "varargLocation"), block("body"), integer(f("functionDepth")), name(f("debugname")), node<Luau::AstTypePack>(f("returnAnnotation")), node<Luau::AstTypePack>(f("varargAnnotation")), optionalLocation(f("argLocation")));
        else if (kind == "TypeReference") {
            std::optional<Luau::AstName> prefix = absent(f("prefix")) ? std::nullopt : std::optional<Luau::AstName>(name(f("prefix")));
            const auto& binding = f("prefixLocal");
            if (prefix && absent(binding)) throw std::runtime_error("Qualified type reference requires authoritative prefixLocal metadata");
            auto prefixLocal = binding.kind == Json::Null || absent(binding) ? nullptr : local(binding);
            if (!prefix && prefixLocal) throw std::runtime_error("Unqualified type reference has a prefix local");
            out = a.alloc<Luau::AstTypeReference>(l, prefix, name(f("name")), optionalLocation(f("prefixLocation")), rangeField(j, "nameLocation"), b("hasParameterList"), typeOrPacks(f("parameters")), prefixLocal);
        } else if (kind == "TypePackExplicit") out = a.alloc<Luau::AstTypePackExplicit>(l, typeList(f("typeList")));
        else if (kind == "TypeTable") {
            std::vector<Luau::AstTableProp> props;
            for (const auto& item : array(f("props").at("values"))) {
                const auto& p = item.at("fields");
                props.push_back({name(p.at("name")), location(p.at("location")), node<Luau::AstType>(p.at("type")), access(p.at("access")), p.has("accessLocation") ? optionalLocation(p.at("accessLocation")) : std::nullopt});
            }
            out = a.alloc<Luau::AstTypeTable>(l, copy(props), indexer(f("indexer")));
        }
        else if (kind == "TypeFunction") {
            std::vector<std::optional<Luau::AstArgumentName>> names;
            for (const auto& item : array(f("argNames").at("values"))) {
                if (absent(item)) names.push_back(std::nullopt);
                else { const auto& p = item.at("fields"); names.push_back(Luau::AstArgumentName{name(p.at("name")), location(p.at("location"))}); }
            }
            out = a.alloc<Luau::AstTypeFunction>(l, nodeArray<Luau::AstAttr>(f("attributes")), nodeArray<Luau::AstGenericType>(f("generics")), nodeArray<Luau::AstGenericTypePack>(f("genericPacks")), typeList(f("argTypes")), copy(names), node<Luau::AstTypePack>(f("returnTypes")));
        }
        else if (kind == "TypeTypeof") out = a.alloc<Luau::AstTypeTypeof>(l, expr("expr"));
        else if (kind == "TypeOptional") out = a.alloc<Luau::AstTypeOptional>(l);
        else if (kind == "TypeUnion") out = a.alloc<Luau::AstTypeUnion>(l, nodeArray<Luau::AstType>(f("types")));
        else if (kind == "TypeIntersection") out = a.alloc<Luau::AstTypeIntersection>(l, nodeArray<Luau::AstType>(f("types")));
        else if (kind == "TypeGroup") out = a.alloc<Luau::AstTypeGroup>(l, type("type"));
        else if (kind == "TypeError") out = a.alloc<Luau::AstTypeError>(l, nodeArray<Luau::AstType>(f("types")), b("isMissing"), integer(f("messageIndex")));
        else if (kind == "TypePackVariadic") out = a.alloc<Luau::AstTypePackVariadic>(l, type("variadicType"));
        else if (kind == "TypePackGeneric") out = a.alloc<Luau::AstTypePackGeneric>(l, name(f("genericName")));
        else if (kind == "TypeSingletonString") {
            auto bytes = literalBytes(text(f("value")));
            out = a.alloc<Luau::AstTypeSingletonString>(l, copy(std::vector<char>(bytes.begin(), bytes.end())));
        }
        else if (kind == "TypeSingletonBool") out = a.alloc<Luau::AstTypeSingletonBool>(l, b("value"));
        else if (kind == "GenericType") out = a.alloc<Luau::AstGenericType>(l, name(f("name")), node<Luau::AstType>(f("defaultValue")));
        else if (kind == "GenericTypePack") out = a.alloc<Luau::AstGenericTypePack>(l, name(f("name")), node<Luau::AstTypePack>(f("defaultValue")));
        // SparkdownReading explicitly ignores interpolation operands and
        // shorthand expressions; preserve that behavior rather than checking
        // invented source. The broad string identity avoids singleton types.
        else if (kind == "SparkdownInterpString") out = synthetic(l, stringName);
        else if (kind == "SparkdownNew") {
            // Temporary compatibility with current checker: result any,
            // arguments still checked in order. Typed new belongs to #601.
            auto args = nodeArray<Luau::AstExpr>(f("args"));
            out = a.alloc<Luau::AstExprCall>(l, synthetic(l, anyName), args, false, Luau::AstArray<Luau::AstTypeOrPack>{}, l);
        }
        else if (kind == "SparkdownDivertTarget" || kind == "SparkdownRegex"
            || kind == "SparkdownConditionalAlternator" || kind == "SparkdownSequentialAlternator"
            || kind == "SparkdownCallShorthand" || kind == "SparkdownFlowArgument") out = synthetic(l, anyName);
        else throw std::runtime_error("Unsupported native AST constructor " + kind);
        if (auto stat = out->asStat()) stat->hasSemicolon = b("hasSemicolon");
        nodes[id] = out; states[id] = 2; return out;
    }
public:
    Decoder(std::string_view input, const Luau::ModuleName& name) : json(Reader(input).parse()) {
        auto version = integer(json.at("schemaVersion"));
        if ((version != 1 && version != 2) || text(json.at("positionEncoding")) != "utf16") throw std::runtime_error("Unsupported AST input schema");
        if (version == 2) markCompact(json); else validateVerbose(json);
        const auto& nodeRecords = array(json.at("nodes")); const auto& localRecords = array(json.at("locals"));
        if (nodeRecords.empty() || nodeRecords.size() + localRecords.size() > 100000) throw std::runtime_error("AST record limit");
        nodes.resize(nodeRecords.size()); states.resize(nodeRecords.size());
        source->name = source->humanReadableName = name; source->type = Luau::SourceCode::Module;
        for (const auto& item : localRecords) {
            auto local = source->allocator->alloc<Luau::AstLocal>(this->name(item.at("name")), location(item.at("location")), nullptr, integer(item.at("functionDepth")), integer(item.at("loopDepth")), nullptr, boolean(item.at("isConst")));
            local->isExported = boolean(item.at("isExported")); locals.push_back(local);
        }
        for (size_t i = 0; i < locals.size(); ++i) {
            const auto& item = localRecords[i]; locals[i]->shadow = local(item.at("shadow")); locals[i]->annotation = node<Luau::AstType>(item.at("annotation"));
        }
        // Shadows always point to an earlier binding. Reject transferred
        // cycles instead of leaving future scope/completion walks unbounded.
        std::unordered_map<Luau::AstLocal*, size_t> localIds;
        for (size_t i = 0; i < locals.size(); ++i) localIds[locals[i]] = i;
        std::vector<unsigned char> shadowStates(locals.size());
        for (auto start : locals) {
            std::vector<size_t> pending;
            for (auto current = start; current; current = current->shadow) {
                const auto id = localIds.at(current);
                if (shadowStates[id] == 2) break;
                if (shadowStates[id] == 1) throw std::runtime_error("Cyclic AST local shadows");
                shadowStates[id] = 1; pending.push_back(id);
            }
            for (auto id : pending) shadowStates[id] = 2;
        }
        source->root = decodeNode(integer(json.at("root"), nodes.size() - 1))->as<Luau::AstStatBlock>();
        if (!source->root) throw std::runtime_error("AST root must be a block");
        for (const auto& error : array(json.at("errors")))
            source->parseErrors.emplace_back(location(error.at("range")), text(error.at("message")));
        for (const auto& comment : array(json.at("hotcomments")))
            source->hotcomments.push_back({boolean(comment.at("header")), location(comment.at("range")), text(comment.at("content"))});
        const auto comments = array(json.at("commentLocations"));
        if (comments.size() > 100000) throw std::runtime_error("AST lexical comment limit");
        for (const auto& comment : comments) {
            auto kind = text(comment.at("kind"));
            auto type = kind == "Comment" ? Luau::Lexeme::Comment : kind == "BlockComment" ? Luau::Lexeme::BlockComment
                : kind == "BrokenComment" ? Luau::Lexeme::BrokenComment : Luau::Lexeme::Eof;
            if (type == Luau::Lexeme::Eof) throw std::runtime_error("Invalid AST lexical comment kind");
            auto range = location(comment.at("range"));
            if (range.end < range.begin || (!source->commentLocations.empty() && range.begin < source->commentLocations.back().location.end))
                throw std::runtime_error("Unordered or overlapping AST lexical comments");
            source->commentLocations.push_back({type, range});
        }
        source->mode = Luau::parseMode(source->hotcomments);
    }
    std::shared_ptr<Luau::SourceModule> result() { return source; }
};
} // namespace
std::shared_ptr<Luau::SourceModule> decodeAst(std::string_view encoded, const Luau::ModuleName& name) { return Decoder(encoded, name).result(); }
void prepareSyntheticBindings(const Luau::SourceModule& source, const Luau::ScopePtr& scope, const Luau::BuiltinTypes& types) {
    for (const auto& [name, type] : {std::pair{anyName, types.anyType}, std::pair{stringName, types.stringType}}) {
        auto identity = source.names->get(name.c_str());
        if (identity.value) scope->bindings[Luau::Symbol(identity)] = {type, Luau::Location()};
    }
}
bool isSyntheticBindingName(std::string_view name) { return name == anyName || name == stringName; }
} // namespace SparkdownAnalysis
