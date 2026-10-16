// Test-only native fixture boundary. Never include this in the production backend.
#pragma once

#include "Fixture.h"
#include "ClassFixture.h"
#include <cstdint>
#include <memory>
#include <variant>
#include <stdexcept>
#include <map>
#include <functional>

LUAU_FASTFLAG(DebugLuauUserDefinedClasses)
LUAU_FASTFLAG(LuauAllowGlobalDeclarationToBeCalledClass)

namespace SparkdownConformance
{
struct AssertionFacts { std::string expression; std::string file; int line; std::string function; };
class AssertionFailure : public std::runtime_error
{
public:
    explicit AssertionFailure(AssertionFacts value) : std::runtime_error("Native Luau assertion failed"), facts(std::move(value)) {}
    AssertionFacts facts;
};
class FixtureTestFailure : public std::runtime_error
{
public:
    using std::runtime_error::runtime_error;
};
std::string runConformanceOperation(const std::function<std::string()>& operation, const std::function<void()>& teardown);
void assertionControl(bool passes);
void doctestControl(bool passes);
bool assertionHandlerRestored();
class RequestError : public std::runtime_error
{
public:
    using std::runtime_error::runtime_error;
};
class SetupError : public std::runtime_error
{
public:
    SetupError(const std::string& message, Luau::LoadDefinitionFileResult result, bool frozen)
        : std::runtime_error(message), definition(std::make_shared<Luau::LoadDefinitionFileResult>(std::move(result))), arenaFrozen(frozen) {}
    std::shared_ptr<Luau::LoadDefinitionFileResult> definition;
    bool arenaFrozen;
};
enum class Preset { Fixture, Builtins, NonStrict, Extern, ExternExplicitNew, RefinementExtern, Classes, Negation, IsSubtype };
struct Flag { std::string name; std::variant<bool, int> value; };
struct Handle { uint64_t session; uint64_t revision; };
struct TypeHandle { Handle result; uint32_t index; };
struct PackHandle { Handle result; uint32_t index; };
struct FunctionCapture { uint64_t session; uint64_t environment; uint32_t index; };
struct CapturedLevels { Luau::TypeLevel before; Luau::TypeLevel after; };
struct TypeFacts
{
    std::string kind;
    std::optional<std::string> documentation;
    std::optional<std::string> definitionModuleName;
    size_t ownProperties = 0;
    std::optional<Luau::FunctionDefinition> definition;
    bool hasSelf = false;
    size_t generics = 0;
    size_t genericPacks = 0;
    size_t typeParameters = 0;
    size_t packParameters = 0;
    std::optional<int> polarity;
    std::optional<int> primitive;
    bool rawTable = false;
    bool rawPersistent = false;
    std::optional<Luau::TypeLevel> tableLevel;
    std::optional<bool> tableScopeIsGlobal;
    std::optional<bool> indexerIsReadOnly;
    std::optional<std::string> name;
};
struct TypeFunFacts
{
    TypeHandle type;
    std::vector<TypeHandle> parameters;
    std::vector<std::optional<TypeHandle>> defaults;
    std::vector<PackHandle> packParameters;
    std::vector<std::optional<PackHandle>> packDefaults;
    std::optional<Luau::Location> definitionLocation;
};
struct ScopeFacts
{
    Luau::Location location;
    std::map<std::string, std::string> imports;
    std::map<std::string, Luau::Location> aliases;
};
struct PackFacts
{
    bool direct = false;
    std::vector<TypeHandle> head;
    bool tail = false;
    std::string tailKind;
    std::optional<PackHandle> tailHandle;
    size_t size = 0;
    bool finite = false;
};
struct PropertyFacts
{
    bool readable;
    bool writable;
    std::optional<std::string> documentation;
    std::optional<Luau::Location> location;
    std::optional<Luau::Location> typeLocation;
};
struct ModuleFacts
{
    std::string name;
    std::string humanReadableName;
    size_t internalNodes;
    size_t interfaceNodes;
    bool checkedInNewSolver;
    bool effectiveNewSolver;
    bool timeout;
    bool cancelled;
};
struct OverloadFacts
{
    size_t ancestry;
    bool expression;
    bool call;
    std::optional<TypeHandle> resolved;
};
struct ErrorFacts
{
    std::string kind;
    Luau::Location location;
    std::string module;
    std::map<std::string, std::variant<bool, size_t, std::string>> fields;
    std::map<std::string, TypeHandle> types;
    std::map<std::string, PackHandle> packs;
    std::map<std::string, std::vector<std::string>> strings;
    std::map<std::string, Luau::Location> locations;
    std::vector<std::string> cycle;
};
const char* nativeErrorKind(const Luau::TypeErrorData& data);

// One session per WASM instance: upstream FValues and print callbacks are instance globals.
class Session
{
public:
    Session(Preset preset, const std::vector<Flag>& flags = {});
    ~Session();
    Session(const Session&) = delete;
    Session& operator=(const Session&) = delete;

    void source(const std::string& module, const std::string& bytes, Luau::SourceCode::Type type);
    // Exact fileResolver assignment; unlike explicit source replacement it does not markDirty.
    void assignSource(const std::string& module, const std::string& bytes, Luau::SourceCode::Type type);
    void nestedBuiltinsFixture();
    Luau::LoadDefinitionFileResult loadDefinition(const std::string& bytes);
    Handle check(const std::string& module, Luau::Mode mode, const std::vector<Flag>& flags = {});
    // Direct Frontend::check: preserve the current config, including a prior mode check.
    Handle checkModule(const std::string& module, const std::vector<Flag>& flags = {});
    void selectNewSolver();
    // This operation loads the exact caller-supplied audited definitions before EVERY check.
    Handle checkNonStrict(const std::string& module, const std::string& definitions, const std::vector<Flag>& flags = {});
    Handle checkNonStrictModule(const std::string& module, const std::string& definitions, const std::vector<Flag>& flags = {});
    void nonStrictBuiltinGlobals();
    const Luau::CheckResult& result(Handle handle) const;
    const std::vector<Flag>& configuration(Handle handle) const;
    TypeHandle binding(Handle handle, const std::string& module, const std::string& name);
    TypeHandle builtin(Handle handle, const std::string& name);
    Handle context() const;
    TypeHandle mainType(Handle handle, const std::string& name);
    TypeHandle positionType(Handle handle, const std::string& module, Luau::Position position, bool expected);
    TypeHandle globalAlias(Handle handle, const std::string& name);
    Luau::Binding globalBinding(Handle handle, const std::string& name);
    void bindGlobal(TypeHandle handle, const std::string& name);
    bool inArena(TypeHandle handle, const std::string& arena, const std::string& module);
    ModuleFacts moduleFacts(Handle handle, const std::string& module);
    std::vector<Luau::TypeError> moduleDiagnostics(Handle handle, const std::string& module);
    OverloadFacts overloadAt(Handle handle, const std::string& module, Luau::Position position);
    std::string decorated(Handle handle, const std::string& module);
    PackHandle modulePack(Handle handle, const std::string& module);
    PackHandle selectedPack(TypeHandle handle, const std::string& selector, size_t index);
    PackFacts packFacts(PackHandle handle, bool flattened);
    TypeHandle packFirst(PackHandle handle);
    std::string printedPack(PackHandle handle, bool exhaustive) const;
    bool identicalPack(PackHandle left, PackHandle right) const;
    TypeHandle followType(TypeHandle handle);
    PackHandle followPack(PackHandle handle);
    TypeHandle normalized(TypeHandle handle);
    // Explicit test instrumentation: allocate a real native Bound wrapper for identity controls.
    TypeHandle boundControl(TypeHandle handle);
    PackHandle boundPackControl(PackHandle handle);
    ErrorFacts errorFacts(Handle handle, size_t index, size_t nestedDepth = 0);
    bool mismatchErrorEquals(Handle handle, size_t index, TypeHandle wanted, TypeHandle given, Luau::Location location) const;
    bool notATableErrorEquals(Handle handle, size_t index, TypeHandle expected, Luau::Location location) const;
    TypeHandle alias(Handle handle, const std::string& module, const std::string& name);
    TypeFunFacts typeFun(Handle handle, const std::string& module, const std::string& name,
        const std::string& lookup, const std::string& prefix);
    std::vector<ScopeFacts> scopes(Handle handle, const std::string& module);
    TypeHandle global(Handle handle, const std::string& name);
    TypeHandle child(TypeHandle handle, const std::string& selector, const std::string& name, size_t index);
    TypeFacts facts(TypeHandle handle) const;
    std::vector<std::string> propertyNames(TypeHandle handle) const;
    PropertyFacts propertyFacts(TypeHandle handle, const std::string& name) const;
    TypeHandle errorType(Handle handle, size_t index, bool wanted);
    PackFacts functionPack(TypeHandle handle, bool arguments, bool flattened);
    void synthetic(const std::string& kind);
    void hiddenTypes();
    void retainGraphs(bool enabled);
    void clearFrontend();
    std::string printed(TypeHandle handle, bool exhaustive = false) const;
    std::string printedOptions(TypeHandle handle, unsigned options, int maxTableLength = -1) const;
    std::string printedPackOptions(PackHandle handle, unsigned options, int maxTableLength = -1) const;
    bool subtype(TypeHandle sub, TypeHandle super);
    bool identical(TypeHandle left, TypeHandle right) const;
    std::optional<Luau::TableState> tableState(TypeHandle handle) const;
    bool mismatchEquals(Handle handle, size_t error, TypeHandle wanted, TypeHandle given) const;
    size_t firstErrorAt(Handle handle, Luau::Position begin) const;
    FunctionCapture captureGlobalFunction(const std::string& global, const std::string& property);
    FunctionCapture captureType(TypeHandle handle);
    CapturedLevels levels(FunctionCapture handle) const;
    TypeHandle capturedType(FunctionCapture capture, Handle result);
    void reset();
    // Actual WASM-instance FValue state also exists before/after a Session.
    static std::variant<bool, int> effectiveFlag(const std::string& name);
    void operationFlags(const std::vector<Flag>& flags);
    std::string withOperationFlags(const std::function<std::string()>& operation);

private:
    FunctionCapture captureFunction(Luau::TypeId selected);
    struct NonStrictFixture : Luau::Fixture
    {
        Luau::Frontend& getFrontend() override;
    };
    struct ExternFixture : Luau::ExternTypeFixture
    {
        Luau::Frontend& getFrontend() override;
    };
    struct RefinementExternFixture : Luau::BuiltinsFixture
    {
        Luau::Frontend& getFrontend() override;
    };
    struct ClassesFixture : Luau::Fixture
    {
        // Exact constructor-owned flags, TypeInfer.classes.test.cpp53–55.
        ScopedFastFlag classes{FFlag::DebugLuauUserDefinedClasses, true};
        ScopedFastFlag declareClass{FFlag::LuauAllowGlobalDeclarationToBeCalledClass, true};
        DOES_NOT_PASS_OLD_SOLVER_GUARD();
        Luau::Frontend& getFrontend() override;
    };
    struct NegationFixture : Luau::Fixture
    {
        // The original fixture shadows Fixture::arena with its own arena.
        Luau::TypeArena arena;
        NegationFixture();
    };
    template<class Base> struct SourceAwareFixture : Base
    {
        // fileResolver.source assignment does not call upstream getFrontend.
        // Existing frontends still need invalidation when a source is replaced.
        void markSourceDirty(const Luau::ModuleName& module)
        {
            if (this->frontend) this->frontend->markDirty(module);
        }
        Luau::Frontend& observationFrontend()
        {
            // Initialize once when necessary, but do not repeat constructor-owned
            // graph registration merely to observe an already initialized object.
            return this->frontend ? *this->frontend : this->getFrontend();
        }
        const Luau::Scope* currentGlobalScope() const
        {
            if (!this->frontend) throw RequestError("Native frontend is not initialized");
            return this->frontend->globals.globalScope.get();
        }
    };
    using FixtureStorage = std::variant<std::unique_ptr<SourceAwareFixture<Luau::Fixture>>,
        std::unique_ptr<SourceAwareFixture<Luau::BuiltinsFixture>>, std::unique_ptr<SourceAwareFixture<NonStrictFixture>>,
        std::unique_ptr<SourceAwareFixture<ExternFixture>>, std::unique_ptr<SourceAwareFixture<RefinementExternFixture>>,
        std::unique_ptr<SourceAwareFixture<ClassesFixture>>, std::unique_ptr<SourceAwareFixture<NegationFixture>>,
        std::unique_ptr<SourceAwareFixture<Luau::IsSubtypeFixture>>>;
    struct Capture { Luau::TypeId type; const Luau::FunctionType* function; Luau::TypeLevel before; };
    struct Overrides
    {
        std::vector<ScopedFastFlag> booleans;
        std::vector<ScopedFastInt> integers;
        ~Overrides();
        void apply(const std::vector<Flag>& flags);
    };
    // Destruction order matters: restore overrides only after all native arenas are gone.
    Overrides overrides;
    FixtureStorage fixture;
    Preset preset;
    uint64_t id;
    uint64_t revision = 0;
    uint64_t environment = 0;
    bool graphSetupAllowed = true;
    bool bodyNewSolverSelected = false;
    bool nestedBuiltinsUsed = false;
    std::optional<Luau::CheckResult> checked;
    std::vector<Flag> checkedFlags;
    std::vector<Flag> requestedOperationFlags;
    std::vector<Luau::TypeId> types;
    std::vector<Luau::TypePackId> packs;
    // Normalization/control results must outlive every retained opaque handle for this revision.
    std::vector<std::unique_ptr<Luau::TypeArena>> queryArenas;
    std::vector<Capture> captures;
    Luau::Fixture& get();
    const Luau::Fixture& get() const;
    Luau::Frontend& observationFrontend();
    void initialize();
    void invalidateResults();
    Luau::TypeId type(TypeHandle handle) const;
    TypeHandle retain(Handle handle, Luau::TypeId value);
    PackHandle retainPack(Handle handle, Luau::TypePackId value);
    Luau::TypePackId pack(PackHandle handle) const;
    void validate(Handle handle) const;
};
}
