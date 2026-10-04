// Compiled only into the generated conformance artifact, never the production WASM.
#include "session.h"
#include <emscripten/emscripten.h>
#include <emscripten/heap.h>
#include <cstdlib>
#include <cmath>
#include <stdexcept>

using namespace SparkdownConformance;
namespace
{
std::unique_ptr<Session> session;
std::vector<Flag> initializationFlags;
std::vector<Flag> caseFlags;
std::string output;

std::string quote(const std::string& value)
{
    std::string result = "\"";
    const char hex[] = "0123456789abcdef";
    for (unsigned char c : value)
    {
        if (c == '"' || c == '\\') { result += '\\'; result += char(c); }
        else if (c < 32) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
        else result += char(c);
    }
    return result + "\"";
}
std::string position(Luau::Position value)
{
    return "{\"line\":" + std::to_string(value.line) + ",\"column\":" + std::to_string(value.column) + "}";
}
std::string location(const std::optional<Luau::Location>& value)
{
    return value ? "{\"begin\":" + position(value->begin) + ",\"end\":" + position(value->end) + "}" : "null";
}
// Overloads cover the exact pinned TypeErrorData alternatives. Luau::visit cannot
// instantiate if the pin adds an alternative without a corresponding observation.
struct ErrorKind
{
#define NATIVE_ERROR_KIND(Name) const char* operator()(const Luau::Name&) const { return #Name; }
    NATIVE_ERROR_KIND(TypeMismatch)
    NATIVE_ERROR_KIND(UnknownSymbol)
    NATIVE_ERROR_KIND(UnknownProperty)
    NATIVE_ERROR_KIND(NotATable)
    NATIVE_ERROR_KIND(CannotExtendTable)
    NATIVE_ERROR_KIND(CannotCompareUnrelatedTypes)
    NATIVE_ERROR_KIND(OnlyTablesCanHaveMethods)
    NATIVE_ERROR_KIND(DuplicateTypeDefinition)
    NATIVE_ERROR_KIND(CountMismatch)
    NATIVE_ERROR_KIND(FunctionDoesNotTakeSelf)
    NATIVE_ERROR_KIND(FunctionRequiresSelf)
    NATIVE_ERROR_KIND(OccursCheckFailed)
    NATIVE_ERROR_KIND(UnknownRequire)
    NATIVE_ERROR_KIND(IncorrectGenericParameterCount)
    NATIVE_ERROR_KIND(SyntaxError)
    NATIVE_ERROR_KIND(CodeTooComplex)
    NATIVE_ERROR_KIND(UnificationTooComplex)
    NATIVE_ERROR_KIND(UnknownPropButFoundLikeProp)
    NATIVE_ERROR_KIND(GenericError)
    NATIVE_ERROR_KIND(InternalError)
    NATIVE_ERROR_KIND(ConstraintSolvingIncompleteError)
    NATIVE_ERROR_KIND(CannotCallNonFunction)
    NATIVE_ERROR_KIND(ExtraInformation)
    NATIVE_ERROR_KIND(DeprecatedApiUsed)
    NATIVE_ERROR_KIND(ModuleHasCyclicDependency)
    NATIVE_ERROR_KIND(CyclicModuleTopLevelAccess)
    NATIVE_ERROR_KIND(IllegalRequire)
    NATIVE_ERROR_KIND(FunctionExitsWithoutReturning)
    NATIVE_ERROR_KIND(DuplicateGenericParameter)
    NATIVE_ERROR_KIND(CannotAssignToNever)
    NATIVE_ERROR_KIND(CannotInferBinaryOperation)
    NATIVE_ERROR_KIND(MissingProperties)
    NATIVE_ERROR_KIND(SwappedGenericTypeParameter)
    NATIVE_ERROR_KIND(OptionalValueAccess)
    NATIVE_ERROR_KIND(MissingUnionProperty)
    NATIVE_ERROR_KIND(TypesAreUnrelated)
    NATIVE_ERROR_KIND(NormalizationTooComplex)
    NATIVE_ERROR_KIND(TypePackMismatch)
    NATIVE_ERROR_KIND(DynamicPropertyLookupOnExternTypesUnsafe)
    NATIVE_ERROR_KIND(UninhabitedTypeFunction)
    NATIVE_ERROR_KIND(UninhabitedTypePackFunction)
    NATIVE_ERROR_KIND(WhereClauseNeeded)
    NATIVE_ERROR_KIND(PackWhereClauseNeeded)
    NATIVE_ERROR_KIND(CheckedFunctionCallError)
    NATIVE_ERROR_KIND(NonStrictFunctionDefinitionError)
    NATIVE_ERROR_KIND(PropertyAccessViolation)
    NATIVE_ERROR_KIND(CheckedFunctionIncorrectArgs)
    NATIVE_ERROR_KIND(UnexpectedTypeInSubtyping)
    NATIVE_ERROR_KIND(UnexpectedTypePackInSubtyping)
    NATIVE_ERROR_KIND(ExplicitFunctionAnnotationRecommended)
    NATIVE_ERROR_KIND(UserDefinedTypeFunctionError)
    NATIVE_ERROR_KIND(BuiltInTypeFunctionError)
    NATIVE_ERROR_KIND(ReservedIdentifier)
    NATIVE_ERROR_KIND(UnexpectedArrayLikeTableItem)
    NATIVE_ERROR_KIND(CannotCheckDynamicStringFormatCalls)
    NATIVE_ERROR_KIND(GenericTypeCountMismatch)
    NATIVE_ERROR_KIND(GenericTypePackCountMismatch)
    NATIVE_ERROR_KIND(MultipleNonviableOverloads)
    NATIVE_ERROR_KIND(RecursiveRestraintViolation)
    NATIVE_ERROR_KIND(GenericBoundsMismatch)
    NATIVE_ERROR_KIND(UnappliedTypeFunction)
    NATIVE_ERROR_KIND(InstantiateGenericsOnNonFunction)
    NATIVE_ERROR_KIND(TypeInstantiationCountMismatch)
    NATIVE_ERROR_KIND(AmbiguousFunctionCall)
    NATIVE_ERROR_KIND(UninitializedFieldAccess)
    NATIVE_ERROR_KIND(TypeAnnotationRequired)
    NATIVE_ERROR_KIND(ConstructorsShouldNotReturnAnything)
#undef NATIVE_ERROR_KIND
};
std::string diagnostic(const Luau::TypeError& error)
{
    std::string result = "{\"module\":" + quote(error.moduleName) + ",\"code\":" + std::to_string(error.code()) +
        ",\"message\":" + quote(Luau::toString(error)) + ",\"begin\":" + position(error.location.begin) +
        ",\"end\":" + position(error.location.end) + ",\"kind\":" + quote(Luau::visit(ErrorKind{}, error.data));
    if (auto checked = Luau::get<Luau::CheckedFunctionCallError>(error))
        result += ",\"checkedFunctionName\":" + quote(checked->checkedFunctionName) +
            ",\"argumentIndex\":" + std::to_string(checked->argumentIndex);
    if (auto definition = Luau::get<Luau::NonStrictFunctionDefinitionError>(error))
        result += ",\"functionName\":" + quote(definition->functionName) +
            ",\"argument\":" + quote(definition->argument);
    return result + "}";
}
Session& get()
{
    if (!session) throw RequestError("Conformance session requires create");
    return *session;
}
uint64_t integer(double value)
{
    if (!std::isfinite(value) || value < 0 || value > 9007199254740991.0 || std::floor(value) != value)
        throw RequestError("Invalid opaque native handle component");
    return uint64_t(value);
}
Handle handle(double id, double revision) { return {integer(id), integer(revision)}; }
TypeHandle typeHandle(double id, double revision, int index)
{
    if (index < 0) throw RequestError("Invalid native type index");
    return {handle(id, revision), uint32_t(index)};
}
PackHandle packHandle(double id, double revision, int index)
{
    if (index < 0) throw RequestError("Invalid native pack index");
    return {handle(id, revision), uint32_t(index)};
}
Luau::Location selectedLocation(int beginLine, int beginColumn, int endLine, int endColumn)
{
    if (beginLine < 0 || beginColumn < 0 || endLine < 0 || endColumn < 0) throw RequestError("Invalid native error location");
    return Luau::Location{Luau::Position(unsigned(beginLine), unsigned(beginColumn)), Luau::Position(unsigned(endLine), unsigned(endColumn))};
}
std::string boolean(bool value);
std::string packObservation(const PackFacts& facts)
{
    std::string json = "{\"status\":\"ok\",\"direct\":" + boolean(facts.direct) + ",\"tail\":" + boolean(facts.tail) +
        ",\"tailKind\":" + quote(facts.tailKind) + ",\"tailIndex\":" + (facts.tailHandle ? std::to_string(facts.tailHandle->index) : "null") +
        ",\"size\":" + std::to_string(facts.size) + ",\"finite\":" + boolean(facts.finite) + ",\"head\":[";
    bool first = true;
    for (auto type : facts.head) { if (!first) json += ','; first = false; json += std::to_string(type.index); }
    return json + "]}";
}
std::string boolean(bool value) { return value ? "true" : "false"; }
std::string definitionResult(const Luau::LoadDefinitionFileResult& result)
{
    std::string json = "\"success\":" + boolean(result.success) + ",\"parseErrors\":[";
    bool first = true;
    for (const auto& error : result.parseResult.errors)
    {
        if (!first) json += ','; first = false;
        json += "{\"message\":" + quote(error.getMessage()) + ",\"begin\":" + position(error.getLocation().begin) +
            ",\"end\":" + position(error.getLocation().end) + "}";
        if (json.size() > 1048576) throw RequestError("Native observation output limit");
    }
    json += "],\"diagnostics\":["; first = true;
    if (result.module) for (const auto& error : result.module->errors)
    {
        if (!first) json += ','; first = false;
        json += diagnostic(error);
        if (json.size() > 1048576) throw RequestError("Native observation output limit");
    }
    return json + "],\"modulePresent\":" + boolean(bool(result.module)) + ",\"sourceModuleName\":" + quote(result.sourceModule.name) +
        ",\"sourceHumanReadableName\":" + quote(result.sourceModule.humanReadableName);
}
std::string checked(Handle value)
{
    const auto& result = get().result(value);
    std::string json = "{\"status\":\"ok\",\"session\":" + std::to_string(value.session) +
        ",\"revision\":" + std::to_string(value.revision) + ",\"diagnostics\":[";
    bool first = true;
    size_t nativeIndex = 0;
    for (const auto& error : result.errors)
    {
        if (!first) json += ',';
        first = false;
        auto entry = diagnostic(error);
        entry.pop_back();
        json += entry + ",\"nativeIndex\":" + std::to_string(nativeIndex++) + "}";
        if (json.size() > 1048576) throw RequestError("Native observation output limit");
    }
    json += "],\"effectiveFlags\":["; first = true;
    for (const auto& flag : get().configuration(value))
    {
        if (!first) json += ','; first = false;
        json += "{\"name\":" + quote(flag.name) + ",\"value\":";
        if (auto value = std::get_if<bool>(&flag.value)) json += boolean(*value);
        else json += std::to_string(std::get<int>(flag.value));
        json += "}";
    }
    return json + "]}";
}
// Native setup, check, diagnostic serialization and every query execute inside
// the session's current operation flags. Queue/lifetime/baseline-only operations
// explicitly opt out. create preserves constructor flags; source and reset are
// case-body operations. Source registration preserves lazy frontend setup;
// reset retains the actual constructor behavior of the selected preset.
template<class F> const char* guarded(F operation, bool scopedOperation = true)
{
    try
    {
        output = scopedOperation && session ? session->withOperationFlags(operation) : operation();
        if (output.size() > 1048576) throw RequestError("Native observation output limit");
    }
    // Derived exceptions must precede InternalCompilerError: classify real C++ objects.
    catch (const Luau::TimeLimitError& error) { session.reset(); output = "{\"status\":\"deadline\",\"message\":" + quote(error.what()) + "}"; }
    catch (const Luau::UserCancelError& error) { session.reset(); output = "{\"status\":\"cancelled\",\"message\":" + quote(error.what()) + "}"; }
    catch (const Luau::InternalCompilerError& error) { session.reset(); output = "{\"status\":\"internal-compiler-error\",\"message\":" + quote(error.what()) + "}"; }
    catch (const std::bad_alloc&) { session.reset(); output = "{\"status\":\"memory-limit\"}"; }
    catch (const SetupError& error)
    {
        // Serialize actual errors while their definition module/globals still
        // exist; then destroy the unusable partial fixture in every path.
        try
        {
            output = "{\"status\":\"setup-error\",\"message\":" + quote(error.what()) + "," +
                definitionResult(*error.definition) + ",\"arenaFrozen\":" + boolean(error.arenaFrozen) + "}";
        }
        catch (...) { output = "{\"status\":\"error\",\"message\":\"Native setup diagnostic serialization failed\"}"; }
        session.reset();
    }
    catch (const RequestError& error) { output = "{\"status\":\"error\",\"message\":" + quote(error.what()) + "}"; }
    catch (const std::exception& error) { session.reset(); output = "{\"status\":\"error\",\"message\":" + quote(error.what()) + "}"; }
    catch (...) { session.reset(); output = "{\"status\":\"error\",\"message\":\"Unknown native exception\"}"; }
    return output.c_str();
}
}

namespace SparkdownConformance
{
const char* nativeErrorKind(const Luau::TypeErrorData& data) { return Luau::visit(ErrorKind{}, data); }
}

extern "C"
{
EMSCRIPTEN_KEEPALIVE void* fixture_allocate(int bytes) { return bytes > 0 && bytes <= 16777216 ? std::malloc(size_t(bytes)) : nullptr; }
EMSCRIPTEN_KEEPALIVE void fixture_free(void* pointer) { std::free(pointer); }
EMSCRIPTEN_KEEPALIVE const char* fixture_flag(const char* name, int kind, int value, int initialization)
{
    return guarded([&] {
        if (!name || !*name || (kind != 0 && kind != 1) || (kind == 0 && value != 0 && value != 1) ||
            (initialization != 0 && initialization != 1)) throw RequestError("Invalid typed native flag request");
        auto& flags = initialization ? initializationFlags : caseFlags;
        if (flags.size() >= 128) throw RequestError("Native flag limit");
        flags.push_back({name, kind == 0 ? std::variant<bool, int>(bool(value)) : std::variant<bool, int>(value)});
        if (!initialization && session) session->operationFlags(caseFlags);
        return std::string("{\"status\":\"ok\"}");
    }, false);
}
EMSCRIPTEN_KEEPALIVE const char* fixture_clear_flags()
{
    initializationFlags.clear(); caseFlags.clear();
    if (session) session->operationFlags(caseFlags);
    output = "{\"status\":\"ok\"}"; return output.c_str();
}
EMSCRIPTEN_KEEPALIVE const char* fixture_flag_value(const char* name)
{
    return guarded([&] {
        auto value = Session::effectiveFlag(name);
        return "{\"status\":\"ok\",\"value\":" + (std::holds_alternative<bool>(value) ? boolean(std::get<bool>(value)) :
            std::to_string(std::get<int>(value))) + "}";
    }, false);
}
EMSCRIPTEN_KEEPALIVE const char* fixture_flag_value_scoped(const char* name)
{
    return guarded([&] {
        auto value = get().effectiveFlag(name);
        return "{\"status\":\"ok\",\"value\":" + (std::holds_alternative<bool>(value) ? boolean(std::get<bool>(value)) :
            std::to_string(std::get<int>(value))) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_create(int preset)
{
    return guarded([&] {
        if (preset < 0 || preset > 8) throw RequestError("Invalid fixture preset");
        session.reset();
        session = std::make_unique<Session>(Preset(preset), initializationFlags);
        session->operationFlags(caseFlags);
        return std::string("{\"status\":\"ok\",\"abi\":1,\"source\":\"7d5f73364fdbbaa984fa545071630eba73cfea98\"}");
    }, false);
}
EMSCRIPTEN_KEEPALIVE const char* fixture_heap_bytes()
{
    // Baseline memory measurement does not require a session or apply case flags.
    return guarded([&] { return "{\"status\":\"ok\",\"bytes\":" + std::to_string(emscripten_get_heap_size()) + "}"; }, false);
}
EMSCRIPTEN_KEEPALIVE const char* fixture_source(const char* module, const char* bytes, int type)
{
    return guarded([&] { get().source(module, bytes, Luau::SourceCode::Type(type)); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_definition(const char* bytes)
{
    return guarded([&] {
        const auto result = get().loadDefinition(bytes);
        return "{\"status\":\"ok\"," + definitionResult(result) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_check(const char* module, int mode)
{
    return guarded([&] { return checked(get().check(module, Luau::Mode(mode), caseFlags)); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_check_module(const char* module)
{
    return guarded([&] { return checked(get().checkModule(module, caseFlags)); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_select_new_solver(const char* mode)
{
    return guarded([&] {
        if (std::string(mode) != "New") throw RequestError("Unsupported case-body solver override");
        get().selectNewSolver();
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_check_nonstrict(const char* module, const char* definitions)
{
    return guarded([&] { return checked(get().checkNonStrict(module, definitions, caseFlags)); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_check_nonstrict_module(const char* module, const char* definitions)
{
    return guarded([&] { return checked(get().checkNonStrictModule(module, definitions, caseFlags)); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_nonstrict_builtin_globals()
{
    // registerBuiltinGlobals is void: completion is not a fabricated load-definition result.
    return guarded([&] { get().nonStrictBuiltinGlobals(); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_binding(double id, double revision, const char* module, const char* name)
{
    return guarded([&] { auto value = get().binding(handle(id, revision), module, name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_builtin(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().builtin(handle(id, revision), name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_printed(double id, double revision, int index)
{
    return guarded([&] { return "{\"status\":\"ok\",\"printed\":" + quote(get().printed(typeHandle(id, revision, index))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_printed_exhaustive(double id, double revision, int index)
{
    return guarded([&] { return "{\"status\":\"ok\",\"printed\":" + quote(get().printed(typeHandle(id, revision, index), true)) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_synthetic(const char* kind)
{
    return guarded([&] { get().synthetic(kind); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_alias(double id, double revision, const char* module, const char* name)
{
    return guarded([&] { auto value = get().alias(handle(id, revision), module, name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_global(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().global(handle(id, revision), name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_type_fun(double id, double revision, const char* module, const char* name,
    const char* lookup, const char* prefix)
{
    return guarded([&] {
        auto facts = get().typeFun(handle(id, revision), module, name, lookup, prefix);
        std::string json = "{\"status\":\"ok\",\"index\":" + std::to_string(facts.type.index) +
            ",\"definitionLocation\":" + location(facts.definitionLocation) + ",\"parameters\":[";
        for (size_t i = 0; i < facts.parameters.size(); ++i)
        {
            if (i) json += ",";
            json += "{\"index\":" + std::to_string(facts.parameters[i].index) + ",\"default\":" +
                (facts.defaults[i] ? std::to_string(facts.defaults[i]->index) : "null") + "}";
        }
        json += "],\"packParameters\":[";
        for (size_t i = 0; i < facts.packParameters.size(); ++i)
        {
            if (i) json += ",";
            json += "{\"index\":" + std::to_string(facts.packParameters[i].index) + ",\"default\":" +
                (facts.packDefaults[i] ? std::to_string(facts.packDefaults[i]->index) : "null") + "}";
        }
        return json + "]}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_scopes(double id, double revision, const char* module)
{
    return guarded([&] {
        auto facts = get().scopes(handle(id, revision), module);
        std::string json = "{\"status\":\"ok\",\"scopes\":[";
        for (size_t i = 0; i < facts.size(); ++i)
        {
            if (i) json += ",";
            const auto& scope = facts[i];
            json += "{\"location\":" + location(scope.location) + ",\"imports\":{";
            bool comma = false;
            for (const auto& [name, module] : scope.imports) { if (comma) json += ","; comma = true; json += quote(name) + ":" + quote(module); }
            json += "},\"aliases\":{";
            comma = false;
            for (const auto& [name, span] : scope.aliases) { if (comma) json += ","; comma = true; json += quote(name) + ":" + location(span); }
            json += "}}";
        }
        return json + "]}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_child(double id, double revision, int type, const char* selector, const char* name, int index)
{
    return guarded([&] { if (index < 0) throw RequestError("Invalid native child index");
        auto value = get().child(typeHandle(id, revision, type), selector, name, size_t(index));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_facts(double id, double revision, int index)
{
    return guarded([&] {
        auto facts = get().facts(typeHandle(id, revision, index));
        std::string json = "{\"status\":\"ok\",\"kind\":" + quote(facts.kind) + ",\"documentation\":" +
            (facts.documentation ? quote(*facts.documentation) : "null") + ",\"ownProperties\":" + std::to_string(facts.ownProperties) +
            ",\"hasSelf\":" + boolean(facts.hasSelf) + ",\"generics\":" + std::to_string(facts.generics) +
            ",\"genericPacks\":" + std::to_string(facts.genericPacks) + ",\"typeParameters\":" + std::to_string(facts.typeParameters) +
            ",\"packParameters\":" + std::to_string(facts.packParameters) + ",\"rawTable\":" + boolean(facts.rawTable) +
            ",\"rawPersistent\":" + boolean(facts.rawPersistent) +
            ",\"tableLevel\":" + (facts.tableLevel ? "[" + std::to_string(facts.tableLevel->level) + "," +
                std::to_string(facts.tableLevel->subLevel) + "]" : "null") +
            ",\"tableScopeIsGlobal\":" + (facts.tableScopeIsGlobal ? boolean(*facts.tableScopeIsGlobal) : "null") +
            ",\"indexerIsReadOnly\":" + (facts.indexerIsReadOnly ? boolean(*facts.indexerIsReadOnly) : "null") +
            ",\"polarity\":" + (facts.polarity ? std::to_string(*facts.polarity) : "null") +
            ",\"primitive\":" + (facts.primitive ? std::to_string(*facts.primitive) : "null") +
            ",\"name\":" + (facts.name ? quote(*facts.name) : "null") +
            ",\"definitionModuleName\":" + (facts.definitionModuleName ? quote(*facts.definitionModuleName) : "null") + ",\"definition\":";
        if (!facts.definition) json += "null";
        else
        {
            const auto& definition = *facts.definition;
            json += "{\"module\":" + (definition.definitionModuleName ? quote(*definition.definitionModuleName) : "null") +
                ",\"begin\":" + position(definition.definitionLocation.begin) + ",\"end\":" + position(definition.definitionLocation.end) +
                ",\"nameBegin\":" + position(definition.originalNameLocation.begin) + ",\"nameEnd\":" + position(definition.originalNameLocation.end) +
                ",\"varargPresent\":" + boolean(bool(definition.varargLocation)) + "}";
        }
        return json + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_function_pack(double id, double revision, int index, int arguments, int flattened)
{
    return guarded([&] {
        if ((arguments != 0 && arguments != 1) || (flattened != 0 && flattened != 1)) throw RequestError("Invalid native pack selector");
        auto facts = get().functionPack(typeHandle(id, revision, index), bool(arguments), bool(flattened));
        return packObservation(facts);
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_property_names(double id, double revision, int index)
{
    return guarded([&] {
        auto names = get().propertyNames(typeHandle(id, revision, index));
        std::string json = "{\"status\":\"ok\",\"names\":[";
        for (size_t i = 0; i < names.size(); ++i) { if (i) json += ","; json += quote(names[i]); }
        return json + "]}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_property_facts(double id, double revision, int index, const char* name)
{
    return guarded([&] {
        auto facts = get().propertyFacts(typeHandle(id, revision, index), name);
        return "{\"status\":\"ok\",\"readable\":" + boolean(facts.readable) + ",\"writable\":" + boolean(facts.writable) +
            ",\"documentation\":" + (facts.documentation ? quote(*facts.documentation) : "null") +
            ",\"location\":" + location(facts.location) + ",\"typeLocation\":" + location(facts.typeLocation) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_error_type(double id, double revision, int index, int wanted)
{
    return guarded([&] {
        if (index < 0 || (wanted != 0 && wanted != 1)) throw RequestError("Invalid native mismatch selector");
        auto value = get().errorType(handle(id, revision), size_t(index), bool(wanted));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_first_error_at(double id, double revision, int line, int column)
{
    return guarded([&] { if (line < 0 || column < 0) throw RequestError("Invalid native diagnostic position");
        return "{\"status\":\"ok\",\"index\":" + std::to_string(get().firstErrorAt(handle(id, revision),
            Luau::Position(unsigned(line), unsigned(column)))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_context()
{
    return guarded([&] { auto value = get().context(); return "{\"status\":\"ok\",\"session\":" + std::to_string(value.session) +
        ",\"revision\":" + std::to_string(value.revision) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_main_type(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().mainType(handle(id, revision), name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_position_type(double id, double revision, const char* module, int line, int column, int expected)
{
    return guarded([&] {
        if (line < 0 || column < 0 || (expected != 0 && expected != 1)) throw RequestError("Invalid native position selector");
        auto value = get().positionType(handle(id, revision), module, Luau::Position(unsigned(line), unsigned(column)), bool(expected));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_global_alias(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().globalAlias(handle(id, revision), name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_binding_facts(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().globalBinding(handle(id, revision), name);
        return "{\"status\":\"ok\",\"documentation\":" + (value.documentationSymbol ? quote(*value.documentationSymbol) : "null") +
            ",\"begin\":" + position(value.location.begin) + ",\"end\":" + position(value.location.end) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_module_facts(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().moduleFacts(handle(id, revision), name);
        return "{\"status\":\"ok\",\"name\":" + quote(value.name) + ",\"humanReadableName\":" + quote(value.humanReadableName) +
            ",\"internalNodes\":" + std::to_string(value.internalNodes) + ",\"interfaceNodes\":" + std::to_string(value.interfaceNodes) +
            ",\"checkedInNewSolver\":" + boolean(value.checkedInNewSolver) + ",\"effectiveNewSolver\":" + boolean(value.effectiveNewSolver) +
            ",\"timeout\":" + boolean(value.timeout) + ",\"cancelled\":" + boolean(value.cancelled) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_module_diagnostics(double id, double revision, const char* name)
{
    return guarded([&] {
        const auto errors = get().moduleDiagnostics(handle(id,revision),name);
        std::string json = "{\"status\":\"ok\",\"module\":" + quote(name) + ",\"diagnostics\":[";
        for (size_t index = 0; index < errors.size(); ++index)
        {
            if (index) json += ',';
            auto entry = diagnostic(errors[index]);
            entry.pop_back();
            json += entry + ",\"moduleIndex\":" + std::to_string(index) + "}";
            if (json.size() + 2 > 1048576) throw RequestError("Native observation output limit");
        }
        return json + "]}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_overload_at(double id, double revision, const char* name, int line, int column)
{
    return guarded([&] {
        if (line < 0 || column < 0) throw RequestError("Invalid native overload position");
        auto value = get().overloadAt(handle(id, revision), name, Luau::Position(unsigned(line), unsigned(column)));
        return "{\"status\":\"ok\",\"ancestry\":" + std::to_string(value.ancestry) + ",\"expression\":" + boolean(value.expression) +
            ",\"call\":" + boolean(value.call) + ",\"resolvedIndex\":" + (value.resolved ? std::to_string(value.resolved->index) : "null") + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_decorated(double id, double revision, const char* name)
{
    return guarded([&] { return "{\"status\":\"ok\",\"decorated\":" + quote(get().decorated(handle(id, revision), name)) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_module_pack(double id, double revision, const char* name)
{
    return guarded([&] { auto value = get().modulePack(handle(id, revision), name);
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_selected_pack(double id, double revision, int type, const char* selector, int index)
{
    return guarded([&] { if (index < 0) throw RequestError("Invalid native selected pack index");
        auto value = get().selectedPack(typeHandle(id, revision, type), selector, size_t(index));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_pack_facts(double id, double revision, int index, int flattened)
{
    return guarded([&] { if (flattened != 0 && flattened != 1) throw RequestError("Invalid native pack flatten selector");
        return packObservation(get().packFacts(packHandle(id, revision, index), bool(flattened))); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_pack_printed(double id, double revision, int index, int exhaustive)
{
    return guarded([&] { if (exhaustive != 0 && exhaustive != 1) throw RequestError("Invalid native pack print selector");
        return "{\"status\":\"ok\",\"printed\":" + quote(get().printedPack(packHandle(id, revision, index), bool(exhaustive))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_pack_first(double id, double revision, int index)
{
    return guarded([&] { auto value = get().packFirst(packHandle(id, revision, index));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_pack_identity(double id, double revision, int left, int right)
{
    return guarded([&] { return "{\"status\":\"ok\",\"identical\":" + boolean(get().identicalPack(
        packHandle(id, revision, left), packHandle(id, revision, right))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_follow(double id, double revision, int index, int selectedPack)
{
    return guarded([&] {
        if (selectedPack != 0 && selectedPack != 1) throw RequestError("Invalid native follow selector");
        auto result = selectedPack ? get().followPack(packHandle(id, revision, index)).index :
            get().followType(typeHandle(id, revision, index)).index;
        return "{\"status\":\"ok\",\"index\":" + std::to_string(result) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_normalized(double id, double revision, int index)
{
    return guarded([&] { auto value = get().normalized(typeHandle(id, revision, index));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_bound_control(double id, double revision, int index, int selectedPack)
{
    return guarded([&] {
        if (selectedPack != 0 && selectedPack != 1) throw RequestError("Invalid native bound control selector");
        auto result = selectedPack ? get().boundPackControl(packHandle(id, revision, index)).index :
            get().boundControl(typeHandle(id, revision, index)).index;
        return "{\"status\":\"ok\",\"index\":" + std::to_string(result) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_error_facts(double id, double revision, int index, int nestedDepth)
{
    return guarded([&] {
        if (index < 0 || nestedDepth < 0) throw RequestError("Invalid native diagnostic selector");
        auto value = get().errorFacts(handle(id, revision), size_t(index), size_t(nestedDepth));
        std::string json = "{\"status\":\"ok\",\"kind\":" + quote(value.kind) + ",\"module\":" + quote(value.module) +
            ",\"begin\":" + position(value.location.begin) + ",\"end\":" + position(value.location.end) + ",\"fields\":{";
        bool first = true;
        for (const auto& [name, field] : value.fields)
        {
            if (!first) json += ','; first = false; json += quote(name) + ':';
            if (auto booleanValue = std::get_if<bool>(&field)) json += boolean(*booleanValue);
            else if (auto integerValue = std::get_if<size_t>(&field)) json += std::to_string(*integerValue);
            else json += quote(std::get<std::string>(field));
        }
        json += "},\"types\":{"; first = true;
        for (auto [name, type] : value.types) { if (!first) json += ','; first = false; json += quote(name) + ':' + std::to_string(type.index); }
        json += "},\"packs\":{"; first = true;
        for (auto [name, pack] : value.packs) { if (!first) json += ','; first = false; json += quote(name) + ':' + std::to_string(pack.index); }
        json += "},\"strings\":{"; first = true;
        for (const auto& [name, values] : value.strings)
        {
            if (!first) json += ','; first = false; json += quote(name) + ":[";
            bool firstItem = true;
            for (const auto& item : values) { if (!firstItem) json += ','; firstItem = false; json += quote(item); }
            json += ']';
        }
        json += "},\"locations\":{"; first = true;
        for (const auto& [name, value] : value.locations) { if (!first) json += ','; first = false; json += quote(name) + ':' + location(value); }
        json += "},\"cycle\":["; first = true;
        if (value.cycle.size() > 256) throw RequestError("Native error cycle observation limit");
        for (const auto& module : value.cycle) { if (!first) json += ','; first = false; json += quote(module); }
        return json + "]}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_mismatch_error(double id, double revision, int index, int wanted, int given,
    int beginLine, int beginColumn, int endLine, int endColumn)
{
    return guarded([&] { if (index < 0) throw RequestError("Invalid native diagnostic index");
        return "{\"status\":\"ok\",\"equal\":" + boolean(get().mismatchErrorEquals(handle(id, revision), size_t(index),
            typeHandle(id, revision, wanted), typeHandle(id, revision, given), selectedLocation(beginLine, beginColumn, endLine, endColumn))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_not_table_error(double id, double revision, int index, int expected,
    int beginLine, int beginColumn, int endLine, int endColumn)
{
    return guarded([&] { if (index < 0) throw RequestError("Invalid native diagnostic index");
        return "{\"status\":\"ok\",\"equal\":" + boolean(get().notATableErrorEquals(handle(id, revision), size_t(index),
            typeHandle(id, revision, expected), selectedLocation(beginLine, beginColumn, endLine, endColumn))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_hidden_types()
{
    return guarded([&] { get().hiddenTypes(); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_retain_graphs(int enabled)
{
    return guarded([&] { if (enabled != 0 && enabled != 1) throw RequestError("Invalid native retention selector");
        get().retainGraphs(bool(enabled)); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_clear_frontend()
{
    return guarded([&] { get().clearFrontend(); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_identity(double id, double revision, int left, int right)
{
    return guarded([&] { return "{\"status\":\"ok\",\"identical\":" + boolean(get().identical(typeHandle(id, revision, left), typeHandle(id, revision, right))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_bind_global(double id, double revision, int index, const char* name)
{
    return guarded([&] { get().bindGlobal(typeHandle(id, revision, index), name); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_in_arena(double id, double revision, int index, const char* arena, const char* module)
{
    return guarded([&] { return "{\"status\":\"ok\",\"present\":" + boolean(get().inArena(typeHandle(id, revision, index), arena, module)) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_print_options(double id, double revision, int index, int options, int selectedPack, int maxTableLength)
{
    return guarded([&] {
        if (options < 0 || options > 511 || (selectedPack != 0 && selectedPack != 1)) throw RequestError("Invalid native print options");
        auto printed = selectedPack ? get().printedPackOptions(packHandle(id, revision, index), unsigned(options), maxTableLength) :
            get().printedOptions(typeHandle(id, revision, index), unsigned(options), maxTableLength);
        return "{\"status\":\"ok\",\"printed\":" + quote(printed) + "}";
    });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_subtype(double id, double revision, int sub, int super)
{
    return guarded([&] { return "{\"status\":\"ok\",\"subtype\":" + boolean(get().subtype(typeHandle(id, revision, sub), typeHandle(id, revision, super))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_table_state(double id, double revision, int index)
{
    return guarded([&] { auto state = get().tableState(typeHandle(id, revision, index));
        return "{\"status\":\"ok\",\"state\":" + (state ? std::to_string(int(*state)) : "null") + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_mismatch(double id, double revision, int error, int wanted, int given)
{
    return guarded([&] { if (error < 0) throw RequestError("Invalid diagnostic index");
        return "{\"status\":\"ok\",\"equal\":" + boolean(get().mismatchEquals(handle(id, revision), size_t(error),
            typeHandle(id, revision, wanted), typeHandle(id, revision, given))) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_capture(const char* global, const char* property)
{
    return guarded([&] { auto value = get().captureGlobalFunction(global, property);
        return "{\"status\":\"ok\",\"session\":" + std::to_string(value.session) + ",\"environment\":" +
            std::to_string(value.environment) + ",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_levels(double id, double environment, int index)
{
    return guarded([&] { if (index < 0) throw RequestError("Invalid capture index");
        auto value = get().levels({integer(id), integer(environment), uint32_t(index)});
        return "{\"status\":\"ok\",\"before\":[" + std::to_string(value.before.level) + "," + std::to_string(value.before.subLevel) +
            "],\"after\":[" + std::to_string(value.after.level) + "," + std::to_string(value.after.subLevel) + "]}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_capture_type(double id, double revision, int index)
{
    return guarded([&] { auto value = get().captureType(typeHandle(id, revision, index));
        return "{\"status\":\"ok\",\"session\":" + std::to_string(value.session) + ",\"environment\":" +
            std::to_string(value.environment) + ",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_captured_type(double id, double environment, int index, double revision)
{
    return guarded([&] { if (index < 0) throw RequestError("Invalid capture index");
        auto value = get().capturedType({integer(id), integer(environment), uint32_t(index)}, handle(id, revision));
        return "{\"status\":\"ok\",\"index\":" + std::to_string(value.index) + "}"; });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_reset()
{
    return guarded([&] { get().reset(); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* fixture_dispose()
{
    session.reset(); initializationFlags.clear(); caseFlags.clear();
    output = "{\"status\":\"ok\"}"; return output.c_str();
}
}
