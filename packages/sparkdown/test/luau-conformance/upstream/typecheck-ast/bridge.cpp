// Adapter for the official parser and luau-ast JSON encoder (MIT, ../LICENSE.txt).
// The parser, flags and options match CLI/src/Ast.cpp at the conformance pin.
#include "Luau/Parser.h"
#include "AstJsonEncoder.cpp"
#include "Luau/Common.h"
#include <cstring>
#include <string>

// The analysis encoder references this analysis-owned debug flag. Its default
// remains false, matching the pinned CLI/test parser configuration.
LUAU_FASTFLAGVARIABLE(DebugLuauIfLocalAnalysis)

static std::string output;
static std::string diagnostics;
static int errors;

// This pin's CLI encoder has no visit overrides for these parser nodes.
// Supply only their serialization; all syntax and positions remain upstream's.
struct Encoder : Luau::AstJsonEncoder
{
    void writeErrors(const std::vector<Luau::ParseError>& errors)
    {
        writeRaw("[");
        for (size_t i = 0; i < errors.size(); ++i)
        {
            if (i) writeRaw(",");
            writeRaw("{"); bool c = pushComma();
            write("message", std::string_view(errors[i].what()));
            field("location", [&]() {
                writeRaw("{"); bool l = pushComma();
                auto position = [&](const char* name, const Luau::Position& at) {
                    field(name, [&]() {
                        writeRaw("{"); bool p = pushComma();
                        write("line", at.line); write("column", at.column);
                        popComma(p); writeRaw("}");
                    });
                };
                const auto& location = errors[i].getLocation();
                position("begin", location.begin); position("end", location.end);
                popComma(l); writeRaw("}");
            });
            popComma(c); writeRaw("}");
        }
        writeRaw("]");
    }
    template<typename F> void field(const char* name, F contents)
    {
        if (comma) writeRaw(",");
        comma = true; writeRaw("\""); writeRaw(name); writeRaw("\":"); contents();
    }
    // Preserve fields the checker needs when loading definition JSON. The
    // upstream encoder predates read/write properties and method semantics.
    void writeIndexer(Luau::AstTableIndexer* indexer)
    {
        if (!indexer) { writeRaw("null"); return; }
        writeRaw("{"); bool c = pushComma();
        write("location", indexer->location);
        write("indexType", indexer->indexType); write("resultType", indexer->resultType);
        write("access", int(indexer->access));
        if (indexer->accessLocation) write("accessLocation", *indexer->accessLocation);
        popComma(c); writeRaw("}");
    }
    bool visit(Luau::AstTypeTable* node) override
    {
        writeNode(node, "AstTypeTable", [&]() {
            field("props", [&]() {
                writeRaw("[");
                for (size_t i = 0; i < node->props.size; ++i) {
                    if (i) writeRaw(",");
                    const auto& prop = node->props.data[i];
                    writeRaw("{"); bool c = pushComma();
                    write("name", prop.name); writeType("AstTableProp");
                    write("location", prop.location); write("propType", prop.type);
                    write("access", int(prop.access));
                    if (prop.accessLocation) write("accessLocation", *prop.accessLocation);
                    popComma(c); writeRaw("}");
                }
                writeRaw("]");
            });
            field("indexer", [&]() { writeIndexer(node->indexer); });
        });
        return false;
    }
    bool visit(Luau::AstStatDeclareExternType* node) override
    {
        writeNode(node, "AstStatDeclareClass", [&]() {
            write("name", node->name);
            if (node->superName) write("superName", *node->superName);
            field("props", [&]() {
                writeRaw("[");
                for (size_t i = 0; i < node->props.size; ++i) {
                    if (i) writeRaw(",");
                    const auto& prop = node->props.data[i];
                    writeRaw("{"); bool c = pushComma();
                    write("name", prop.name); write("nameLocation", prop.nameLocation);
                    writeType("AstDeclaredClassProp"); write("luauType", prop.ty);
                    write("location", prop.location); write("access", int(prop.access));
                    write("isMethod", prop.isMethod);
                    popComma(c); writeRaw("}");
                }
                writeRaw("]");
            });
            field("indexer", [&]() { writeIndexer(node->indexer); });
        });
        return false;
    }
    bool visit(Luau::AstStatDeclareGlobal* node) override
    {
        // Upstream writes two "type" keys here, hiding the node discriminator.
        writeNode(node, "AstStatDeclareGlobal", [&]() {
            write("name", node->name); write("nameLocation", node->nameLocation);
            write("luauType", node->type);
        });
        return false;
    }
    bool visit(Luau::AstTypeReference* node) override
    {
        writeNode(node, "AstTypeReference", [&]() {
            if (node->prefix) write("prefix", *node->prefix);
            if (node->prefixLocation) write("prefixLocation", *node->prefixLocation);
            write("name", node->name); write("nameLocation", node->nameLocation);
            write("parameters", node->parameters); write("hasParameterList", node->hasParameterList);
        });
        return false;
    }
    bool visit(Luau::AstStatTypeAlias* node) override
    {
        writeNode(node, "AstStatTypeAlias", [&]() {
            write("name", node->name); write("nameLocation", node->nameLocation);
            write("generics", node->generics); write("genericPacks", node->genericPacks);
            write("value", node->type); write("exported", node->exported);
        });
        return false;
    }
    bool visit(Luau::AstAttr* node) override
    {
        writeNode(node, "AstAttr", [&]() { write("name", node->name); write("args", node->args); });
        return false;
    }
    void writeAttributes(Luau::AstArray<Luau::AstAttr*> attributes)
    {
        field("attributes", [&]() {
            writeRaw("[");
            for (size_t i = 0; i < attributes.size; ++i) {
                if (i) writeRaw(",");
                visit(attributes.data[i]);
            }
            writeRaw("]");
        });
    }
    bool visit(Luau::AstStatDeclareFunction* node) override
    {
        writeNode(node, "AstStatDeclareFunction", [&]() {
            writeAttributes(node->attributes);
            write("name", node->name); write("nameLocation", node->nameLocation);
            write("params", node->params); write("paramNames", node->paramNames);
            write("vararg", node->vararg); write("varargLocation", node->varargLocation);
            write("retTypes", node->retTypes); write("generics", node->generics); write("genericPacks", node->genericPacks);
        });
        return false;
    }
    bool visit(Luau::AstTypeFunction* node) override
    {
        writeNode(node, "AstTypeFunction", [&]() {
            writeAttributes(node->attributes); write("generics", node->generics); write("genericPacks", node->genericPacks);
            write("argTypes", node->argTypes); write("argNames", node->argNames); write("returnTypes", node->returnTypes);
        });
        return false;
    }
    bool visit(Luau::AstExprFunction* node) override
    {
        writeNode(node, "AstExprFunction", [&]() {
            writeAttributes(node->attributes); write("generics", node->generics); write("genericPacks", node->genericPacks);
            if (node->self) write("self", node->self);
            write("args", node->args);
            if (node->returnAnnotation) write("returnAnnotation", node->returnAnnotation);
            write("vararg", node->vararg); write("varargLocation", node->varargLocation);
            if (node->varargAnnotation) write("varargAnnotation", node->varargAnnotation);
            write("body", node->body); write("functionDepth", node->functionDepth); write("debugname", node->debugname);
        });
        return false;
    }
    bool visit(Luau::AstStatFunction* node) override
    {
        writeNode(node, "AstStatFunction", [&]() {
            write("name", node->name); write("func", static_cast<Luau::AstNode*>(node->func));
        });
        return false;
    }
    bool visit(Luau::AstStatLocalFunction* node) override
    {
        writeNode(node, "AstStatLocalFunction", [&]() {
            write("name", node->name); write("func", static_cast<Luau::AstNode*>(node->func));
        });
        return false;
    }
    bool visit(Luau::AstExprConstantInteger* node) override { write(node); return false; }
    bool visit(Luau::AstExprInstantiate* node) override
    {
        writeNode(node, "AstExprInstantiate", [&]() { write("expr", node->expr); write("typeArguments", node->typeArguments); });
        return false;
    }
    bool visit(Luau::AstStatTypeFunction* node) override
    {
        writeNode(node, "AstStatTypeFunction", [&]() {
            write("name", node->name); write("nameLocation", node->nameLocation);
            write("body", static_cast<Luau::AstNode*>(node->body)); write("exported", node->exported); write("hasErrors", node->hasErrors);
        });
        return false;
    }
};

extern "C" const char* parse_ast(const char* source)
{
    for (Luau::FValue<bool>* flag = Luau::FValue<bool>::list; flag; flag = flag->next)
        if (strncmp(flag->name, "Luau", 4) == 0)
            flag->value = true;
    Luau::Allocator allocator;
    Luau::AstNameTable names(allocator);
    Luau::ParseOptions options;
    options.captureComments = true;
    options.allowDeclarationSyntax = true;
    auto result = Luau::Parser::parse(source, strlen(source), names, allocator, options);
    errors = int(result.errors.size());
    Encoder errorEncoder;
    errorEncoder.writeErrors(result.errors);
    diagnostics = errorEncoder.str();
    if (errors) output = "null"; // Recovery shapes are deliberately not compared.
    else { Encoder encoder; result.root->visit(&encoder); output = encoder.str(); }
    return output.c_str();
}

extern "C" int parse_errors() { return errors; }
extern "C" const char* parse_error_json() { return diagnostics.c_str(); }
