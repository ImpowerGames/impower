// Adapter for the official parser and luau-ast JSON encoder (MIT, ../LICENSE.txt).
// The parser, flags and options match CLI/src/Ast.cpp at the conformance pin.
#include "Luau/Parser.h"
#include "AstJsonEncoder.cpp"
#include "Luau/Common.h"
#include <cstring>
#include <string>

static std::string output;
static int errors;

// This pin's CLI encoder has no visit overrides for these parser nodes.
// Supply only their serialization; all syntax and positions remain upstream's.
struct Encoder : Luau::AstJsonEncoder
{
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
            write("body", node->body); write("exported", node->exported); write("hasErrors", node->hasErrors);
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
    if (errors) output = "null"; // Recovery shapes are deliberately not compared.
    else { Encoder encoder; result.root->visit(&encoder); output = encoder.str(); }
    return output.c_str();
}

extern "C" int parse_errors() { return errors; }
