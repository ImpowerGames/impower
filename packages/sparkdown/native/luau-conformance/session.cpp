#include "session.h"
#include "Luau/BuiltinDefinitions.h"
#include "Luau/AstQuery.h"
#include "Luau/TypeAttach.h"
#include "Luau/PrettyPrinter.h"
#include "Luau/Subtyping.h"
#include "Luau/Normalize.h"
#include "Luau/Unifier.h"
#include "Luau/TypeInfer.h"
#include <limits>
#include <set>
#include <stdexcept>


namespace SparkdownConformance
{
namespace
{
// Exact pinned TypeVariant/TypePackVariant visitors: a changed alternative
// fails compilation rather than collapsing a real predicate into "other".
struct TypeKind
{
#define KIND(Name) const char* operator()(const Luau::Name&) const { return #Name; }
    KIND(BoundType) KIND(ErrorType) KIND(FreeType) KIND(GenericType)
    KIND(PrimitiveType) KIND(SingletonType) KIND(BlockedType) KIND(PendingExpansionType)
    KIND(FunctionType) KIND(TableType) KIND(MetatableType) KIND(ExternType)
    KIND(AnyType) KIND(UnionType) KIND(IntersectionType) KIND(LazyType)
    KIND(UnknownType) KIND(NeverType) KIND(NegationType) KIND(NoRefineType)
    KIND(TypeFunctionInstanceType)
#undef KIND
};
struct PackKind
{
#define KIND(Name) const char* operator()(const Luau::Name&) const { return #Name; }
    KIND(BoundTypePack) KIND(ErrorTypePack) KIND(FreeTypePack) KIND(GenericTypePack)
    KIND(TypePack) KIND(VariadicTypePack) KIND(BlockedTypePack) KIND(TypeFunctionInstanceTypePack)
#undef KIND
};
uint64_t nextSession = 0;
Session* activeSession = nullptr;
template<class T> Luau::FValue<T>* findFlag(const std::string& name)
{
    for (auto flag = Luau::FValue<T>::list; flag; flag = flag->next)
        if (name == flag->name) return flag;
    return nullptr;
}
Luau::ToStringOptions printOptions(unsigned mask, int maxTableLength = -1)
{
    if (mask > 511) throw RequestError("Invalid native print options");
    Luau::ToStringOptions value;
    value.exhaustive = mask & 1;
    value.useLineBreaks = mask & 2;
    value.functionTypeArguments = mask & 4;
    value.hideTableKind = mask & 8;
    value.hideNamedFunctionTypeParameters = mask & 16;
    value.hideFunctionSelfArgument = mask & 32;
    value.hideTableAliasExpansions = mask & 64;
    value.useQuestionMarks = mask & 128;
    value.ignoreSyntheticName = mask & 256;
    if (maxTableLength < -1) throw RequestError("Invalid native maximum table print length");
    if (maxTableLength >= 0) value.maxTableLength = size_t(maxTableLength);
    return value;
}
// Exact pinned TypeInfer.refinements.test.cpp24-79 magic, including the original
// assertion. Do not substitute a printed name or an ordinary ClassFixture graph.
struct MagicInstanceIsA final : Luau::MagicFunction
{
    std::optional<Luau::WithPredicate<Luau::TypePackId>> handleOldSolver(
        Luau::TypeChecker& typeChecker, const Luau::ScopePtr& scope, const Luau::AstExprCall& expr,
        Luau::WithPredicate<Luau::TypePackId> withPredicate) override
    {
        if (expr.args.size != 1) return std::nullopt;
        auto index = expr.func->as<Luau::AstExprIndexName>();
        auto str = expr.args.data[0]->as<Luau::AstExprConstantString>();
        if (!index || !str) return std::nullopt;
        std::optional<Luau::LValue> lvalue = Luau::tryGetLValue(*index->expr);
        std::optional<Luau::TypeFun> tfun = scope->lookupType(std::string(str->value.data, str->value.size));
        if (!lvalue || !tfun) return std::nullopt;
        Luau::ModulePtr module = typeChecker.currentModule;
        Luau::TypePackId booleanPack = module->internalTypes->addTypePack({typeChecker.booleanType});
        return Luau::WithPredicate<Luau::TypePackId>{booleanPack,
            {Luau::IsAPredicate{std::move(*lvalue), expr.location, tfun->type}}};
    }
    bool infer(const Luau::MagicFunctionCallContext&) override { return false; }
    void refine(const Luau::MagicRefinementContext& ctx) override
    {
        if (ctx.callSite->args.size != 1 || ctx.discriminantTypes.empty()) return;
        auto index = ctx.callSite->func->as<Luau::AstExprIndexName>();
        auto str = ctx.callSite->args.data[0]->as<Luau::AstExprConstantString>();
        if (!index || !str) return;
        std::optional<Luau::TypeId> discriminantTy = ctx.discriminantTypes[0];
        if (!discriminantTy) return;
        std::optional<Luau::TypeFun> tfun = ctx.scope->lookupType(std::string(str->value.data, str->value.size));
        if (!tfun) return;
        LUAU_ASSERT(Luau::get<Luau::BlockedType>(*discriminantTy));
        Luau::asMutable(*discriminantTy)->ty.emplace<Luau::BoundType>(tfun->type);
    }
};
}

Luau::Frontend& Session::NonStrictFixture::getFrontend()
{
    if (frontend) return *frontend;
    auto& value = Luau::Fixture::getFrontend();
    Luau::registerHiddenTypes(value);
    registerTestTypes();
    return value;
}
Luau::Frontend& Session::ClassesFixture::getFrontend()
{
    if (frontend) return *frontend;
    // Exact literal/setup order from pinned TypeInfer.classes.test.cpp20–55.
    const std::string definitions = R"LUAU_SRC(
@checked declare function require(target: any): any
declare function sqrt(n: number): number
declare function tostring<T>(value: T): string

declare class: {
    isinstance: @checked (o: unknown, c: class) -> boolean,
    classof: @checked (o: unknown) -> class?
}
)LUAU_SRC";
    auto& f = Luau::Fixture::getFrontend();
    Luau::unfreeze(f.globals.globalTypes);
    try
    {
        auto result = f.loadDefinitionFile(f.globals, f.globals.globalScope, definitions, "@test", false);
        if (!result.success)
        {
            Luau::freeze(f.globals.globalTypes);
            throw SetupError("ClassesFixture definition setup failed", std::move(result),
                f.globals.globalTypes.types.isFrozen() && f.globals.globalTypes.typePacks.isFrozen());
        }
        auto name = f.globals.globalNames.names->getOrAdd("require");
        auto binding = f.globals.globalScope->bindings.find(name);
        // Explicit failure propagation replaces the original release-disabled
        // LUAU_ASSERT; a partial setup never becomes a usable fixture session.
        if (binding == f.globals.globalScope->bindings.end())
            throw std::runtime_error("ClassesFixture require binding setup failed");
        Luau::attachTag(binding->second.typeId, Luau::kRequireTagName);
        Luau::attachMagicFunction(binding->second.typeId, std::make_shared<Luau::MagicRequire>());
        registerTestTypes();
    }
    catch (...) { Luau::freeze(f.globals.globalTypes); throw; }
    Luau::freeze(f.globals.globalTypes);
    return *frontend;
}
Session::NegationFixture::NegationFixture()
{
    Luau::registerHiddenTypes(getFrontend());
}
Luau::Frontend& Session::ExternFixture::getFrontend()
{
    // The upstream helper registers its graph on each call. A session installs it once.
    if (frontend) return *frontend;
    return Luau::ExternTypeFixture::getFrontend();
}
Luau::Frontend& Session::RefinementExternFixture::getFrontend()
{
    if (frontend) return *frontend;
    // Exact pinned RefinementExternTypeFixture graph/setup order, lines82-153.
    auto& f = Luau::BuiltinsFixture::getFrontend();
    auto& arena = getFrontend().globals.globalTypes;
    Luau::NotNull<Luau::Scope> scope{getFrontend().globals.globalScope.get()};
    std::optional<Luau::TypeId> rootSuper = std::make_optional(f.builtinTypes->externType);
    Luau::unfreeze(arena);
    try
    {
        auto vec3 = arena.addType(Luau::ExternType{"Vector3", {}, rootSuper, std::nullopt, {}, nullptr, "Test", {}});
        Luau::getMutable<Luau::ExternType>(vec3)->props = {
            {"X", Luau::Property{f.builtinTypes->numberType}}, {"Y", Luau::Property{f.builtinTypes->numberType}},
            {"Z", Luau::Property{f.builtinTypes->numberType}}};
        auto inst = arena.addType(Luau::ExternType{"Instance", {}, rootSuper, std::nullopt, {}, nullptr, "Test", {}});
        auto isAParams = arena.addTypePack({inst, f.builtinTypes->stringType});
        auto isARets = arena.addTypePack({f.builtinTypes->booleanType});
        auto isA = arena.addType(Luau::FunctionType{isAParams, isARets});
        Luau::getMutable<Luau::FunctionType>(isA)->magic = std::make_shared<MagicInstanceIsA>();
        Luau::getMutable<Luau::ExternType>(inst)->props = {
            {"Name", Luau::Property{f.builtinTypes->stringType}}, {"IsA", Luau::Property{isA}}};
        auto connection = arena.addType(Luau::ExternType{"ExternScriptConnection", {}, inst, std::nullopt, {}, nullptr, "Test", {}});
        auto disconnectArgs = arena.addTypePack({connection});
        auto disconnect = arena.addType(Luau::FunctionType{disconnectArgs, f.builtinTypes->emptyTypePack});
        Luau::getMutable<Luau::ExternType>(connection)->props = {{"Disconnect", Luau::Property{disconnect}}};
        auto folder = f.globals.globalTypes.addType(Luau::ExternType{"Folder", {}, inst, std::nullopt, {}, nullptr, "Test", {}});
        auto part = f.globals.globalTypes.addType(Luau::ExternType{"Part", {}, inst, std::nullopt, {}, nullptr, "Test", {}});
        Luau::getMutable<Luau::ExternType>(part)->props = {{"Position", Luau::Property{vec3}}};
        auto optionalPart = arena.addType(Luau::UnionType{{part, f.builtinTypes->nilType}});
        auto weld = getFrontend().globals.globalTypes.addType(
            Luau::ExternType{"WeldConstraint", {}, inst, std::nullopt, {}, nullptr, "Test", {}});
        Luau::getMutable<Luau::ExternType>(weld)->props = {
            {"Part0", Luau::Property{optionalPart}}, {"Part1", Luau::Property{optionalPart}}};
        f.globals.globalScope->exportedTypeBindings["Vector3"] = Luau::TypeFun{{}, vec3};
        f.globals.globalScope->exportedTypeBindings["Instance"] = Luau::TypeFun{{}, inst};
        f.globals.globalScope->exportedTypeBindings["ExternScriptConnection"] = Luau::TypeFun{{}, connection};
        f.globals.globalScope->exportedTypeBindings["Folder"] = Luau::TypeFun{{}, folder};
        f.globals.globalScope->exportedTypeBindings["Part"] = Luau::TypeFun{{}, part};
        f.globals.globalScope->exportedTypeBindings["WeldConstraint"] = Luau::TypeFun{{}, weld};
        for (const auto& [name, ty] : f.globals.globalScope->exportedTypeBindings) Luau::persist(ty.type);
        f.setLuauSolverMode(!FFlag::DebugLuauForceOldSolver ? Luau::SolverMode::New : Luau::SolverMode::Old);
    }
    catch (...) { Luau::freeze(arena); throw; }
    Luau::freeze(getFrontend().globals.globalTypes);
    return *frontend;
}

Session::Overrides::~Overrides()
{
    // ScopedFValue restoration is a stack. Vector's element destruction order is insufficient.
    while (!integers.empty()) integers.pop_back();
    while (!booleans.empty()) booleans.pop_back();
}
void Session::Overrides::apply(const std::vector<Flag>& flags)
{
    std::set<std::string> names;
    // Validate the complete request before modifying any native FValue.
    for (const auto& flag : flags)
    {
        if (!names.insert(flag.name).second) throw RequestError("Duplicate flag: " + flag.name);
        bool found = std::holds_alternative<bool>(flag.value) ? findFlag<bool>(flag.name) != nullptr : findFlag<int>(flag.name) != nullptr;
        if (!found) throw RequestError("Unknown or mistyped flag: " + flag.name);
    }
    for (const auto& flag : flags)
    {
        if (auto value = std::get_if<bool>(&flag.value)) booleans.emplace_back(*findFlag<bool>(flag.name), *value);
        else integers.emplace_back(*findFlag<int>(flag.name), std::get<int>(flag.value));
    }
}
void Session::operationFlags(const std::vector<Flag>& flags) { requestedOperationFlags = flags; }
std::string Session::withOperationFlags(const std::function<std::string()>& operation)
{
    Overrides operationOverrides;
    operationOverrides.apply(requestedOperationFlags);
    return operation();
}

Session::Session(Preset selected, const std::vector<Flag>& flags) : preset(selected), id(++nextSession)
{
    if (activeSession) throw RequestError("One conformance session per WASM instance");
    // Match the pinned upstream all-Luau-flags-enabled new-solver test configuration.
    for (auto flag = Luau::FValue<bool>::list; flag; flag = flag->next)
        if (std::string(flag->name).compare(0, 4, "Luau") == 0) overrides.booleans.emplace_back(*flag, true);
    overrides.booleans.emplace_back(FFlag::DebugLuauForceOldSolver, false);
    overrides.apply(flags);
    if (FFlag::DebugLuauForceOldSolver && preset != Preset::ExternExplicitNew)
        throw RequestError("Native conformance requires selected new solver");
    initialize();
    activeSession = this;
}

Session::~Session()
{
    if (activeSession == this) activeSession = nullptr;
}

void Session::initialize()
{
    // Use typed owners: Fixture has no virtual destructor.
    switch (preset)
    {
    case Preset::Fixture: fixture = std::make_unique<SourceAwareFixture<Luau::Fixture>>(); break;
    case Preset::Builtins: fixture = std::make_unique<SourceAwareFixture<Luau::BuiltinsFixture>>(); break;
    case Preset::NonStrict: fixture = std::make_unique<SourceAwareFixture<NonStrictFixture>>(); break;
    case Preset::Extern: fixture = std::make_unique<SourceAwareFixture<ExternFixture>>(); break;
    case Preset::ExternExplicitNew: fixture = std::make_unique<SourceAwareFixture<ExternFixture>>(); break;
    case Preset::RefinementExtern: fixture = std::make_unique<SourceAwareFixture<RefinementExternFixture>>(); break;
    case Preset::Classes: fixture = std::make_unique<SourceAwareFixture<ClassesFixture>>(); break;
    case Preset::Negation: fixture = std::make_unique<SourceAwareFixture<NegationFixture>>(); break;
    case Preset::IsSubtype: fixture = std::make_unique<SourceAwareFixture<Luau::IsSubtypeFixture>>(); break;
    default: throw RequestError("Invalid fixture preset");
    }
    // Upstream Fixture construction is lazy: case-body ScopedFastFlags can
    // precede the first getFrontend and affect GlobalTypes/builtin setup. Do not
    // force that first operation during ordinary fixture construction.
    // The explicit-new regression alone requests a frontend mode transition.
    if (preset == Preset::ExternExplicitNew) get().getFrontend().setLuauSolverMode(Luau::SolverMode::New);
}

Luau::Fixture& Session::get()
{
    return std::visit([](auto& owner) -> Luau::Fixture& { return *owner; }, fixture);
}
const Luau::Fixture& Session::get() const
{
    return std::visit([](const auto& owner) -> const Luau::Fixture& { return *owner; }, fixture);
}

void Session::invalidateResults()
{
    if (revision == std::numeric_limits<uint64_t>::max()) throw RequestError("Native revision exhausted");
    ++revision;
    types.clear();
    packs.clear();
    queryArenas.clear();
    checked.reset();
    checkedFlags.clear();
}

void Session::source(const std::string& module, const std::string& bytes, Luau::SourceCode::Type type)
{
    if (type != Luau::SourceCode::Module && type != Luau::SourceCode::Script && type != Luau::SourceCode::None)
        throw RequestError("Invalid source type");
    invalidateResults();
    graphSetupAllowed = false;
    auto& value = get();
    value.fileResolver.source[module] = bytes;
    value.fileResolver.sourceTypes[module] = type;
    std::visit([&](auto& owner) { owner->markSourceDirty(module); }, fixture);
}

Luau::LoadDefinitionFileResult Session::loadDefinition(const std::string& bytes)
{
    invalidateResults();
    graphSetupAllowed = false;
    // Definitions persist into this same global arena. Deliberately retained
    // global FunctionType captures keep their original object and level.
    auto& frontend = get().getFrontend();
    auto& globals = frontend.globals;
    Luau::unfreeze(globals.globalTypes);
    Luau::LoadDefinitionFileResult result;
    try { result = frontend.loadDefinitionFile(globals, globals.globalScope, bytes, "@test", false, false); }
    catch (...) { Luau::freeze(globals.globalTypes); throw; }
    Luau::freeze(globals.globalTypes);
    // Direct-load tests assert false success and real diagnostics. Setup callers separately
    // require success; never route through a logging-only doctest REQUIRE helper.
    return result;
}

void Session::selectNewSolver()
{
    if (preset != Preset::Extern || checked)
        throw RequestError("Case-body New override requires the original fresh ExternTypeFixture");
    // TypeInfer.externTypes.test.cpp933: lazy construction precedes body flags;
    // this actual operation initializes under them before selecting New.
    auto& frontend = get().getFrontend();
    frontend.setLuauSolverMode(Luau::SolverMode::New);
    if (frontend.getLuauSolverMode() != Luau::SolverMode::New)
        throw RequestError("Native frontend did not select New solver");
    bodyNewSolverSelected = true;
    invalidateResults();
}
Handle Session::check(const std::string& module, Luau::Mode mode, const std::vector<Flag>& flags)
{
    Overrides caseOverrides;
    caseOverrides.apply(flags);
    if (FFlag::DebugLuauForceOldSolver && preset != Preset::ExternExplicitNew &&
        !(bodyNewSolverSelected && get().getFrontend().getLuauSolverMode() == Luau::SolverMode::New))
        throw RequestError("Native conformance requires selected new solver");
    if (mode != Luau::Mode::Strict && mode != Luau::Mode::Nonstrict && mode != Luau::Mode::NoCheck)
        throw RequestError("Invalid check mode");
    auto& value = get();
    if (!value.fileResolver.source.count(module)) throw RequestError("Missing root module");
    invalidateResults();
    graphSetupAllowed = false;
    // Fixture::check328 initializes first; getFrontend734 assigns the initial
    // Strict config. Assigning the requested mode before that loses it.
    auto& frontend = value.getFrontend();
    value.configResolver.defaultConfig.mode = mode;
    frontend.markDirty(module);
    frontend.clearStats();
    checked = frontend.check(module);
    for (const auto& flag : flags) checkedFlags.push_back({flag.name, effectiveFlag(flag.name)});
    return {id, revision};
}

Handle Session::checkModule(const std::string& module, const std::vector<Flag>& flags)
{
    Overrides caseOverrides;
    caseOverrides.apply(flags);
    if (FFlag::DebugLuauForceOldSolver && preset != Preset::ExternExplicitNew &&
        !(bodyNewSolverSelected && get().getFrontend().getLuauSolverMode() == Luau::SolverMode::New))
        throw RequestError("Native conformance requires selected new solver");
    auto& value = get();
    if (!value.fileResolver.source.count(module)) throw RequestError("Missing root module");
    invalidateResults();
    graphSetupAllowed = false;
    // Actual named operation: no mode assignment, markDirty, clearStats or extra check.
    checked = value.getFrontend().check(module);
    for (const auto& flag : flags) checkedFlags.push_back({flag.name, effectiveFlag(flag.name)});
    return {id, revision};
}

Handle Session::checkNonStrict(const std::string& module, const std::string& definitions, const std::vector<Flag>& flags)
{
    if (preset != Preset::NonStrict) throw RequestError("Wrong fixture for checkNonStrict");
    Overrides caseOverrides;
    caseOverrides.apply(flags);
    ScopedFastFlag newSolver(FFlag::DebugLuauForceOldSolver, false);
    if (!loadDefinition(definitions).success) throw RequestError("Native definition load failed");
    auto handle = check(module, Luau::Mode::Nonstrict);
    for (const auto& flag : flags) checkedFlags.push_back({flag.name, effectiveFlag(flag.name)});
    return handle;
}

Handle Session::checkNonStrictModule(const std::string& module, const std::string& definitions, const std::vector<Flag>& flags)
{
    if (preset != Preset::NonStrict) throw RequestError("Wrong fixture for checkNonStrictModule");
    Overrides caseOverrides;
    caseOverrides.apply(flags);
    ScopedFastFlag newSolver(FFlag::DebugLuauForceOldSolver, false);
    if (!loadDefinition(definitions).success) throw RequestError("Native definition load failed");
    auto handle = checkModule(module);
    for (const auto& flag : flags) checkedFlags.push_back({flag.name, effectiveFlag(flag.name)});
    return handle;
}

void Session::nonStrictBuiltinGlobals()
{
    if (preset != Preset::NonStrict) throw RequestError("NonStrict builtin registration requires exact NonStrict fixture");
    if (!graphSetupAllowed || !captures.empty())
        throw RequestError("NonStrict builtin registration requires fresh fixture before setup, captures or checks");
    graphSetupAllowed = false;
    invalidateResults();
    auto& value = get();
    auto& frontend = value.getFrontend();
    auto& normal = frontend.globals.globalTypes;
    auto& autocomplete = frontend.globalsForAutocomplete.globalTypes;
    // Exact NonStrictTypeChecker.test.cpp672-689 operation order on the SAME arenas.
    Luau::unfreeze(normal);
    Luau::unfreeze(autocomplete);
    try
    {
        Luau::registerBuiltinGlobals(frontend, frontend.globals);
        value.registerTestTypes();
    }
    catch (...)
    {
        Luau::freeze(normal);
        Luau::freeze(autocomplete);
        throw;
    }
    Luau::freeze(normal);
    Luau::freeze(autocomplete);
}

const Luau::CheckResult& Session::result(Handle handle) const
{
    validate(handle);
    if (!checked) throw RequestError("Native context has no check result");
    return *checked;
}
const std::vector<Flag>& Session::configuration(Handle handle) const
{
    result(handle);
    return checkedFlags;
}

TypeHandle Session::binding(Handle handle, const std::string& module, const std::string& name)
{
    result(handle);
    auto nativeModule = get().getFrontend().moduleResolver.getModule(module);
    if (!nativeModule || !nativeModule->hasModuleScope()) throw RequestError("Missing native module scope");
    auto value = Luau::lookupName(nativeModule->getModuleScope(), name);
    if (!value) throw RequestError("Missing native binding: " + name);
    if (types.size() >= 4096) throw RequestError("Native type handle limit");
    types.push_back(*value);
    return {handle, uint32_t(types.size() - 1)};
}

TypeHandle Session::builtin(Handle handle, const std::string& name)
{
    validate(handle);
    auto builtins = get().getBuiltins();
    Luau::TypeId value = nullptr;
    if (name == "number") value = builtins->numberType;
    else if (name == "string") value = builtins->stringType;
    else if (name == "boolean") value = builtins->booleanType;
    else if (name == "any") value = builtins->anyType;
    else if (name == "nil") value = builtins->nilType;
    else if (name == "error") value = builtins->errorType;
    else if (name == "unknown") value = builtins->unknownType;
    else if (name == "never") value = builtins->neverType;
    else if (name == "function") value = builtins->functionType;
    else if (name == "table") value = builtins->tableType;
    else throw RequestError("Unknown builtin selector: " + name);
    if (types.size() >= 4096) throw RequestError("Native type handle limit");
    types.push_back(value);
    return {handle, uint32_t(types.size() - 1)};
}

TypeHandle Session::retain(Handle handle, Luau::TypeId value)
{
    validate(handle);
    if (!value) throw RequestError("Absent native type");
    if (types.size() >= 4096) throw RequestError("Native type handle limit");
    types.push_back(value);
    return {handle, uint32_t(types.size() - 1)};
}
void Session::validate(Handle handle) const
{
    if (handle.session != id || handle.revision != revision) throw RequestError("Stale native result handle");
}
Handle Session::context() const { return {id, revision}; }
TypeHandle Session::mainType(Handle handle, const std::string& name)
{
    result(handle);
    auto module = get().getFrontend().moduleResolver.getModule("MainModule");
    if (!module || !module->hasModuleScope()) throw RequestError("Missing native main module scope");
    // Exact Fixture::getType + requireType behavior, including the raw-flag branch.
    auto value = FFlag::DebugLuauForceOldSolver ? Luau::lookupName(module->getModuleScope(), name) :
        Luau::linearSearchForBinding(module->getModuleScope().get(), name.c_str());
    if (!value) throw RequestError("Missing native main binding: " + name);
    return retain(handle, Luau::follow(*value));
}
TypeHandle Session::positionType(Handle handle, const std::string& module, Luau::Position position, bool expected)
{
    result(handle);
    auto& frontend = get().getFrontend();
    auto checkedModule = frontend.moduleResolver.getModule(module);
    auto sourceModule = frontend.getSourceModule(module);
    if (!checkedModule || !sourceModule) throw RequestError("Missing native module for position query");
    auto value = expected ? Luau::findExpectedTypeAtPosition(*checkedModule, *sourceModule, position) :
        Luau::findTypeAtPosition(*checkedModule, *sourceModule, position);
    if (!value) throw RequestError("Absent native position type");
    return retain(handle, *value);
}
TypeHandle Session::globalAlias(Handle handle, const std::string& name)
{
    validate(handle);
    auto value = get().getFrontend().globals.globalScope->lookupType(name);
    if (!value) throw RequestError("Missing native global alias: " + name);
    return retain(handle, value->type);
}
Luau::Binding Session::globalBinding(Handle handle, const std::string& name)
{
    validate(handle);
    auto value = get().getFrontend().globals.globalScope->linearSearchForBinding(name);
    if (!value) throw RequestError("Missing native global binding: " + name);
    return *value;
}
ModuleFacts Session::moduleFacts(Handle handle, const std::string& name)
{
    result(handle);
    auto& frontend = get().getFrontend();
    if (!frontend.options.retainFullTypeGraphs) throw RequestError("Native module graph retention disabled; node counts unavailable");
    auto module = frontend.moduleResolver.getModule(name);
    if (!module || !module->internalTypes) throw RequestError("Missing retained native module graph");
    return {module->name, module->humanReadableName, module->internalTypes->types.size(), module->interfaceTypes.types.size(),
        module->checkedInNewSolver, frontend.getLuauSolverMode() == Luau::SolverMode::New, module->timeout, module->cancelled};
}
std::vector<Luau::TypeError> Session::moduleDiagnostics(Handle handle, const std::string& name)
{
    result(handle);
    if (name.empty() || name.size() > 4096) throw RequestError("Invalid native module selection");
    auto module = get().getFrontend().moduleResolver.getModule(name);
    if (!module) throw RequestError("Missing native module: " + name);
    if (module->errors.size() > 256) throw RequestError("Native module diagnostic limit256");
    return module->errors;
}
void Session::bindGlobal(TypeHandle handle, const std::string& name)
{
    auto selected = type(handle);
    if (checked) throw RequestError("Native global binding must precede checks or follow explicit frontend clear");
    if (name.empty() || name.size() > 256 || name.find('\0') != std::string::npos)
        throw RequestError("Invalid native global binding name");
    // This is the actual upstream operation point for lazy frontend setup.
    // A module/query-owned type cannot survive in the persistent global scope.
    auto& frontend = get().getFrontend();
    // BuiltinTypes owns a private arena; its real public numberType identifies
    // that same arena (Type.cpp844-850), as in retained function captures.
    auto builtinArena = get().getBuiltins()->numberType->owningArena;
    if ((!builtinArena || !Luau::isInArena(selected, *builtinArena)) && !Luau::isInArena(selected, frontend.globals.globalTypes))
        throw RequestError("Native global binding requires a builtin or global arena type");
    Luau::addGlobalBinding(frontend.globals, name, selected, "@test");
    invalidateResults();
    graphSetupAllowed = false;
}
bool Session::inArena(TypeHandle handle, const std::string& arena, const std::string& name)
{
    auto selected = type(handle);
    if (arena == "global") return Luau::isInArena(selected, get().getFrontend().globals.globalTypes);
    if (arena != "interface") throw RequestError("Invalid native arena selector");
    result(handle.result);
    auto module = get().getFrontend().moduleResolver.getModule(name);
    if (!module) throw RequestError("Missing native module for arena membership");
    // Fixture.cpp923 uses contains(raw TypeId); deliberately no follow here.
    return Luau::isInArena(selected, module->interfaceTypes);
}
OverloadFacts Session::overloadAt(Handle handle, const std::string& name, Luau::Position position)
{
    result(handle);
    auto& frontend = get().getFrontend();
    auto module = frontend.moduleResolver.getModule(name);
    auto source = frontend.getSourceModule(name);
    if (!module || !source) throw RequestError("Missing native overload module");
    auto ancestry = Luau::findAstAncestryOfPosition(*source, position);
    OverloadFacts facts{ancestry.size(), false, false, std::nullopt};
    if (ancestry.size() >= 2)
    {
        auto selected = ancestry[ancestry.size() - 2];
        auto expression = selected->asExpr();
        facts.expression = bool(expression);
        facts.call = expression && expression->is<Luau::AstExprCall>();
        if (auto value = module->astOverloadResolvedTypes.find(selected)) facts.resolved = retain(handle, *value);
    }
    return facts;
}
std::string Session::decorated(Handle handle, const std::string& name)
{
    result(handle);
    auto& frontend = get().getFrontend();
    auto module = frontend.moduleResolver.getModule(name);
    auto source = frontend.getSourceModule(name);
    if (!module || !source || !source->root) throw RequestError("Missing native decoration module");
    Luau::attachTypeData(*source, *module);
    return Luau::prettyPrintWithTypes(*source->root);
}
PackHandle Session::retainPack(Handle handle, Luau::TypePackId value)
{
    validate(handle);
    if (!value) throw RequestError("Absent native type pack");
    if (packs.size() >= 4096) throw RequestError("Native pack handle limit");
    packs.push_back(value);
    return {handle, uint32_t(packs.size() - 1)};
}
Luau::TypePackId Session::pack(PackHandle handle) const
{
    validate(handle.result);
    if (handle.index >= packs.size()) throw RequestError("Invalid native pack handle");
    return packs[handle.index];
}
PackHandle Session::modulePack(Handle handle, const std::string& name)
{
    result(handle);
    auto module = get().getFrontend().moduleResolver.getModule(name);
    if (!module) throw RequestError("Missing native pack module");
    return retainPack(handle, module->returnType);
}
PackHandle Session::selectedPack(TypeHandle handle, const std::string& selector, size_t index)
{
    auto value = Luau::follow(type(handle));
    if (auto function = Luau::get<Luau::FunctionType>(value))
    {
        if (selector == "arguments") return retainPack(handle.result, function->argTypes);
        if (selector == "returns") return retainPack(handle.result, function->retTypes);
        if (selector == "genericPack")
        {
            if (index >= function->genericPacks.size()) throw RequestError("Invalid native generic pack index");
            return retainPack(handle.result, function->genericPacks[index]);
        }
    }
    if (selector == "packParameter")
        if (auto table = Luau::get<Luau::TableType>(value))
        {
            if (index >= table->instantiatedTypePackParams.size()) throw RequestError("Invalid native pack parameter index");
            return retainPack(handle.result, table->instantiatedTypePackParams[index]);
        }
    throw RequestError("Native type is not a function or lacks selected pack");
}
std::string Session::printedPack(PackHandle handle, bool exhaustive) const
{
    return Luau::toString(pack(handle), Luau::ToStringOptions(exhaustive));
}
TypeHandle Session::packFirst(PackHandle handle)
{
    auto value = Luau::first(pack(handle));
    if (!value) throw RequestError("Absent native pack first type");
    return retain(handle.result, *value);
}
bool Session::identicalPack(PackHandle left, PackHandle right) const { return pack(left) == pack(right); }
TypeHandle Session::followType(TypeHandle handle) { return retain(handle.result, Luau::follow(type(handle))); }
PackHandle Session::followPack(PackHandle handle) { return retainPack(handle.result, Luau::follow(pack(handle))); }
TypeHandle Session::normalized(TypeHandle handle)
{
    auto input = type(handle);
    result(handle.result);
    if (queryArenas.size() >= 256) throw RequestError("Native query arena limit");
    auto arena = std::make_unique<Luau::TypeArena>();
    auto& frontend = get().getFrontend();
    // Exact refinements694 New-solver Normalizer recipe; retain its arena because
    // the result is an opaque native TypeId, not merely a transient printed string.
    Luau::UnifierSharedState state{Luau::NotNull{&frontend.iceHandler}};
    Luau::Normalizer normalizer{arena.get(), get().getBuiltins(), Luau::NotNull{&state}, Luau::SolverMode::New};
    auto normal = normalizer.normalize(input);
    if (!normal) throw RequestError("Native normalization failed");
    auto value = normalizer.typeFromNormal(*normal);
    queryArenas.push_back(std::move(arena));
    return retain(handle.result, value);
}
TypeHandle Session::boundControl(TypeHandle handle)
{
    auto target = type(handle);
    if (queryArenas.size() >= 256) throw RequestError("Native query arena limit");
    auto arena = std::make_unique<Luau::TypeArena>();
    auto bound = arena->addType(Luau::BoundType{target});
    queryArenas.push_back(std::move(arena));
    return retain(handle.result, bound);
}
PackHandle Session::boundPackControl(PackHandle handle)
{
    auto target = pack(handle);
    if (queryArenas.size() >= 256) throw RequestError("Native query arena limit");
    auto arena = std::make_unique<Luau::TypeArena>();
    auto bound = arena->addTypePack(Luau::TypePackVar{Luau::BoundTypePack{target}});
    queryArenas.push_back(std::move(arena));
    return retainPack(handle.result, bound);
}
ErrorFacts Session::errorFacts(Handle handle, size_t index, size_t nestedDepth)
{
    const auto& errors = result(handle).errors;
    if (index >= errors.size()) throw RequestError("Invalid native diagnostic index");
    if (nestedDepth > 8) throw RequestError("Native nested error observation limit");
    const Luau::TypeError* selected = &errors[index];
    for (size_t depth = 0; depth < nestedDepth; ++depth)
    {
        auto mismatch = Luau::get<Luau::TypeMismatch>(*selected);
        if (!mismatch || !mismatch->error) throw RequestError("Absent native nested TypeMismatch error");
        selected = mismatch->error.get();
    }
    const auto& error = *selected;
    ErrorFacts facts;
    facts.kind = nativeErrorKind(error.data); facts.location = error.location; facts.module = error.moduleName;
    auto bounded = [](size_t count) { if (count > 256) throw RequestError("Native diagnostic collection observation limit"); };
    auto typeList = [&](const std::string& name, const auto& values) {
        bounded(values.size()); facts.fields[name + "Count"] = values.size();
        for (size_t i = 0; i < values.size(); ++i) facts.types[name + ":" + std::to_string(i)] = retain(handle, values[i]);
    };
    if (auto value = Luau::get<Luau::CountMismatch>(error))
    {
        facts.kind = "CountMismatch"; facts.fields = {{"expected", value->expected}, {"actual", value->actual},
            {"context", size_t(value->context)}, {"isVariadic", value->isVariadic}, {"function", value->function}};
        if (value->maximum) facts.fields["maximum"] = *value->maximum;
    }
    else if (auto value = Luau::get<Luau::UnknownSymbol>(error))
    {
        facts.kind = "UnknownSymbol"; facts.fields["name"] = value->name; facts.fields["context"] = size_t(value->context);
    }
    else if (auto value = Luau::get<Luau::UnknownProperty>(error))
    {
        facts.kind = "UnknownProperty"; facts.fields["key"] = value->key; facts.types["table"] = retain(handle, value->table);
    }
    else if (auto value = Luau::get<Luau::TypeMismatch>(error))
    {
        facts.kind = "TypeMismatch"; facts.types["wanted"] = retain(handle, value->wantedType); facts.types["given"] = retain(handle, value->givenType);
        facts.fields["reason"] = value->reason; facts.fields["context"] = size_t(value->context); facts.fields["nestedErrorPresent"] = bool(value->error);
    }
    else if (auto value = Luau::get<Luau::TypePackMismatch>(error))
    {
        facts.kind = "TypePackMismatch"; facts.packs["wanted"] = retainPack(handle, value->wantedTp); facts.packs["given"] = retainPack(handle, value->givenTp);
        facts.fields["reason"] = value->reason;
    }
    else if (auto value = Luau::get<Luau::AmbiguousFunctionCall>(error))
    {
        facts.kind = "AmbiguousFunctionCall"; facts.packs["arguments"] = retainPack(handle, value->arguments);
        facts.types["function"] = retain(handle, value->function);
    }
    else if (auto value = Luau::get<Luau::ExplicitFunctionAnnotationRecommended>(error))
    {
        facts.kind = "ExplicitFunctionAnnotationRecommended"; facts.types["recommendedReturn"] = retain(handle, value->recommendedReturn);
        bounded(value->recommendedArgs.size());
        facts.fields["recommendedArgsCount"] = value->recommendedArgs.size();
        for (size_t i = 0; i < value->recommendedArgs.size(); ++i)
        {
            facts.strings["recommendedArgs"].push_back(value->recommendedArgs[i].first);
            facts.types["recommendedArg:" + std::to_string(i)] = retain(handle, value->recommendedArgs[i].second);
        }
    }
    else if (auto value = Luau::get<Luau::MultipleNonviableOverloads>(error))
    {
        facts.kind = "MultipleNonviableOverloads"; facts.fields["attemptedArgCount"] = value->attemptedArgCount;
    }
    else if (auto value = Luau::get<Luau::NotATable>(error)) { facts.kind = "NotATable"; facts.types["ty"] = retain(handle, value->ty); }
    else if (auto value = Luau::get<Luau::ExtraInformation>(error)) { facts.kind = "ExtraInformation"; facts.fields["message"] = value->message; }
    else if (auto value = Luau::get<Luau::GenericError>(error)) { facts.kind = "GenericError"; facts.fields["message"] = value->message; }
    else if (auto value = Luau::get<Luau::ModuleHasCyclicDependency>(error)) { facts.kind = "ModuleHasCyclicDependency"; facts.cycle = value->cycle; }
    else if (auto value = Luau::get<Luau::CannotExtendTable>(error))
    { facts.types["tableType"] = retain(handle, value->tableType); facts.fields["context"] = size_t(value->context); facts.fields["prop"] = value->prop; }
    else if (auto value = Luau::get<Luau::CannotCompareUnrelatedTypes>(error))
    { facts.types["left"] = retain(handle, value->left); facts.types["right"] = retain(handle, value->right); facts.fields["op"] = size_t(value->op); }
    else if (auto value = Luau::get<Luau::OnlyTablesCanHaveMethods>(error)) facts.types["tableType"] = retain(handle, value->tableType);
    else if (auto value = Luau::get<Luau::DuplicateTypeDefinition>(error))
    { facts.fields["name"] = value->name; facts.fields["previousLocationPresent"] = bool(value->previousLocation); if (value->previousLocation) facts.locations["previous"] = *value->previousLocation; }
    else if (auto value = Luau::get<Luau::UnknownRequire>(error)) facts.fields["modulePath"] = value->modulePath;
    else if (auto value = Luau::get<Luau::IncorrectGenericParameterCount>(error))
    {
        facts.fields["name"] = value->name; facts.fields["actualParameters"] = value->actualParameters; facts.fields["actualPackParameters"] = value->actualPackParameters;
        facts.types["typeFun"] = retain(handle, value->typeFun.type);
        bounded(value->typeFun.typeParams.size()); bounded(value->typeFun.typePackParams.size());
        facts.fields["typeParamsCount"] = value->typeFun.typeParams.size(); facts.fields["typePackParamsCount"] = value->typeFun.typePackParams.size();
        for (size_t i = 0; i < value->typeFun.typeParams.size(); ++i)
        {
            const auto& param = value->typeFun.typeParams[i];
            const auto key = "typeParam:" + std::to_string(i); facts.types[key] = retain(handle, param.ty);
            facts.fields[key + ":defaultPresent"] = bool(param.defaultValue);
            if (param.defaultValue) facts.types[key + ":default"] = retain(handle, *param.defaultValue);
        }
        for (size_t i = 0; i < value->typeFun.typePackParams.size(); ++i)
        {
            const auto& param = value->typeFun.typePackParams[i];
            const auto key = "typePackParam:" + std::to_string(i); facts.packs[key] = retainPack(handle, param.tp);
            facts.fields[key + ":defaultPresent"] = bool(param.defaultValue);
            if (param.defaultValue) facts.packs[key + ":default"] = retainPack(handle, *param.defaultValue);
        }
        facts.fields["definitionLocationPresent"] = bool(value->typeFun.definitionLocation);
        if (value->typeFun.definitionLocation) facts.locations["definition"] = *value->typeFun.definitionLocation;
    }
    else if (auto value = Luau::get<Luau::SyntaxError>(error)) facts.fields["message"] = value->message;
    else if (auto value = Luau::get<Luau::UnknownPropButFoundLikeProp>(error))
    { facts.types["table"] = retain(handle, value->table); facts.fields["key"] = value->key; bounded(value->candidates.size()); facts.strings["candidates"] = {value->candidates.begin(), value->candidates.end()}; }
    else if (auto value = Luau::get<Luau::InternalError>(error)) facts.fields["message"] = value->message;
    else if (auto value = Luau::get<Luau::CannotCallNonFunction>(error)) facts.types["ty"] = retain(handle, value->ty);
    else if (auto value = Luau::get<Luau::DeprecatedApiUsed>(error))
    { facts.fields["symbol"] = value->symbol; facts.fields["useInstead"] = value->useInstead; }
    else if (auto value = Luau::get<Luau::CyclicModuleTopLevelAccess>(error))
    { facts.fields["cyclicModuleName"] = value->cyclicModuleName; facts.fields["localName"] = value->localName; facts.fields["propName"] = value->propName; }
    else if (auto value = Luau::get<Luau::FunctionExitsWithoutReturning>(error)) facts.packs["expectedReturnType"] = retainPack(handle, value->expectedReturnType);
    else if (auto value = Luau::get<Luau::IllegalRequire>(error))
    { facts.fields["moduleName"] = value->moduleName; facts.fields["reason"] = value->reason; }
    else if (auto value = Luau::get<Luau::MissingProperties>(error))
    { facts.types["superType"] = retain(handle, value->superType); facts.types["subType"] = retain(handle, value->subType); facts.fields["context"] = size_t(value->context); bounded(value->properties.size()); facts.strings["properties"] = value->properties; }
    else if (auto value = Luau::get<Luau::DuplicateGenericParameter>(error)) facts.fields["parameterName"] = value->parameterName;
    else if (auto value = Luau::get<Luau::CannotInferBinaryOperation>(error))
    { facts.fields["op"] = size_t(value->op); facts.fields["kind"] = size_t(value->kind); facts.fields["suggestedToAnnotatePresent"] = bool(value->suggestedToAnnotate); if (value->suggestedToAnnotate) facts.fields["suggestedToAnnotate"] = *value->suggestedToAnnotate; }
    else if (auto value = Luau::get<Luau::SwappedGenericTypeParameter>(error))
    { facts.fields["name"] = value->name; facts.fields["kind"] = size_t(value->kind); }
    else if (auto value = Luau::get<Luau::OptionalValueAccess>(error)) facts.types["optional"] = retain(handle, value->optional);
    else if (auto value = Luau::get<Luau::MissingUnionProperty>(error))
    { facts.types["type"] = retain(handle, value->type); facts.fields["key"] = value->key; typeList("missing", value->missing); }
    else if (auto value = Luau::get<Luau::TypesAreUnrelated>(error))
    { facts.types["left"] = retain(handle, value->left); facts.types["right"] = retain(handle, value->right); }
    else if (auto value = Luau::get<Luau::DynamicPropertyLookupOnExternTypesUnsafe>(error)) facts.types["ty"] = retain(handle, value->ty);
    else if (auto value = Luau::get<Luau::UninhabitedTypeFunction>(error)) facts.types["ty"] = retain(handle, value->ty);
    else if (auto value = Luau::get<Luau::UninhabitedTypePackFunction>(error)) facts.packs["tp"] = retainPack(handle, value->tp);
    else if (auto value = Luau::get<Luau::WhereClauseNeeded>(error)) facts.types["ty"] = retain(handle, value->ty);
    else if (auto value = Luau::get<Luau::PackWhereClauseNeeded>(error)) facts.packs["tp"] = retainPack(handle, value->tp);
    else if (auto value = Luau::get<Luau::CheckedFunctionCallError>(error))
    { facts.types["expected"] = retain(handle, value->expected); facts.types["passed"] = retain(handle, value->passed); facts.fields["checkedFunctionName"] = value->checkedFunctionName; facts.fields["argumentIndex"] = value->argumentIndex; }
    else if (auto value = Luau::get<Luau::NonStrictFunctionDefinitionError>(error))
    { facts.fields["functionName"] = value->functionName; facts.fields["argument"] = value->argument; facts.types["argumentType"] = retain(handle, value->argumentType); }
    else if (auto value = Luau::get<Luau::PropertyAccessViolation>(error))
    { facts.types["table"] = retain(handle, value->table); facts.fields["key"] = value->key; facts.fields["context"] = size_t(value->context); }
    else if (auto value = Luau::get<Luau::CheckedFunctionIncorrectArgs>(error))
    { facts.fields["functionName"] = value->functionName; facts.fields["expected"] = value->expected; facts.fields["actual"] = value->actual; }
    else if (auto value = Luau::get<Luau::CannotAssignToNever>(error))
    { facts.types["rhsType"] = retain(handle, value->rhsType); facts.fields["reason"] = size_t(value->reason); typeList("cause", value->cause); }
    else if (auto value = Luau::get<Luau::UnexpectedTypeInSubtyping>(error)) facts.types["ty"] = retain(handle, value->ty);
    else if (auto value = Luau::get<Luau::UnexpectedTypePackInSubtyping>(error)) facts.packs["tp"] = retainPack(handle, value->tp);
    else if (auto value = Luau::get<Luau::UserDefinedTypeFunctionError>(error)) facts.fields["message"] = value->message;
    else if (auto value = Luau::get<Luau::BuiltInTypeFunctionError>(error))
    {
        facts.fields["typeFunctionModule"] = value->error.moduleName; facts.locations["typeFunction"] = value->error.location;
        Luau::visit([&](const auto& detail) {
            using T = std::decay_t<decltype(detail)>;
            if constexpr (std::is_same_v<T, Luau::UnsupportedType>) { facts.fields["typeFunctionKind"] = std::string("UnsupportedType"); facts.types["typeFunctionType"] = retain(handle, detail.type); }
            else if constexpr (std::is_same_v<T, Luau::UnsupportedTypePack>) { facts.fields["typeFunctionKind"] = std::string("UnsupportedTypePack"); facts.packs["typeFunctionPack"] = retainPack(handle, detail.pack); }
            else if constexpr (std::is_same_v<T, Luau::RuntimeError>) { facts.fields["typeFunctionKind"] = std::string("RuntimeError"); facts.fields["message"] = detail.message; }
            else if constexpr (std::is_same_v<T, Luau::FailedToCompile>) { facts.fields["typeFunctionKind"] = std::string("FailedToCompile"); facts.fields["functionName"] = detail.functionName; facts.fields["compileError"] = detail.compileError; }
            else if constexpr (std::is_same_v<T, Luau::TypeFunctionMissing>) { facts.fields["typeFunctionKind"] = std::string("TypeFunctionMissing"); facts.fields["functionName"] = detail.functionName; }
            else static_assert(!sizeof(T), "Unobserved pinned type function error alternative");
        }, value->error.data);
    }
    else if (auto value = Luau::get<Luau::ReservedIdentifier>(error)) facts.fields["name"] = value->name;
    else if (auto value = Luau::get<Luau::GenericTypeCountMismatch>(error))
    { facts.fields["subTyGenericCount"] = value->subTyGenericCount; facts.fields["superTyGenericCount"] = value->superTyGenericCount; }
    else if (auto value = Luau::get<Luau::GenericTypePackCountMismatch>(error))
    { facts.fields["subTyGenericPackCount"] = value->subTyGenericPackCount; facts.fields["superTyGenericPackCount"] = value->superTyGenericPackCount; }
    else if (auto value = Luau::get<Luau::GenericBoundsMismatch>(error))
    { facts.fields["genericName"] = std::string(value->genericName); typeList("lowerBounds", value->lowerBounds); typeList("upperBounds", value->upperBounds); }
    else if (auto value = Luau::get<Luau::InstantiateGenericsOnNonFunction>(error)) facts.fields["interestingEdgeCase"] = size_t(value->interestingEdgeCase);
    else if (auto value = Luau::get<Luau::TypeInstantiationCountMismatch>(error))
    {
        facts.fields["functionNamePresent"] = bool(value->functionName); if (value->functionName) facts.fields["functionName"] = *value->functionName;
        facts.types["functionType"] = retain(handle, value->functionType); facts.fields["providedTypes"] = value->providedTypes;
        facts.fields["maximumTypes"] = value->maximumTypes; facts.fields["providedTypePacks"] = value->providedTypePacks; facts.fields["maximumTypePacks"] = value->maximumTypePacks;
    }
    else if (auto value = Luau::get<Luau::UninitializedFieldAccess>(error))
    { facts.fields["fieldNamePresent"] = bool(value->fieldName); if (value->fieldName) facts.fields["fieldName"] = *value->fieldName; }
    else if (auto value = Luau::get<Luau::TypeAnnotationRequired>(error)) facts.types["inferredTy"] = retain(handle, value->inferredTy);
    bounded(facts.cycle.size());
    return facts;
}
bool Session::mismatchErrorEquals(Handle handle, size_t index, TypeHandle wanted, TypeHandle given, Luau::Location location) const
{
    const auto& errors = result(handle).errors;
    if (index >= errors.size()) throw RequestError("Invalid native diagnostic index");
    return Luau::TypeError{location, Luau::TypeMismatch{type(wanted), type(given)}} == errors[index];
}
bool Session::notATableErrorEquals(Handle handle, size_t index, TypeHandle expected, Luau::Location location) const
{
    const auto& errors = result(handle).errors;
    if (index >= errors.size()) throw RequestError("Invalid native diagnostic index");
    return Luau::TypeError{location, Luau::NotATable{type(expected)}} == errors[index];
}
TypeHandle Session::alias(Handle handle, const std::string& module, const std::string& name)
{
    result(handle);
    auto nativeModule = get().getFrontend().moduleResolver.getModule(module);
    if (!nativeModule || !nativeModule->hasModuleScope()) throw RequestError("Missing native module scope");
    auto value = nativeModule->getModuleScope()->lookupType(name);
    if (!value) throw RequestError("Missing native alias: " + name);
    return retain(handle, value->type);
}
TypeHandle Session::global(Handle handle, const std::string& name)
{
    validate(handle);
    auto value = Luau::lookupName(get().getFrontend().globals.globalScope, name);
    if (!value) throw RequestError("Missing native global: " + name);
    return retain(handle, *value);
}
TypeFunFacts Session::typeFun(Handle handle, const std::string& module, const std::string& name,
    const std::string& lookup, const std::string& prefix)
{
    result(handle);
    auto native = get().getFrontend().moduleResolver.getModule(module);
    if (!native || !native->hasModuleScope()) throw RequestError("Missing native module scope");
    std::optional<Luau::TypeFun> value;
    if (lookup == "ordinary") value = native->getModuleScope()->lookupType(name);
    else if (lookup == "imported") value = native->getModuleScope()->lookupImportedType(prefix, name);
    else if (lookup == "exported")
    {
        auto found = native->exportedTypeBindings.find(name);
        if (found != native->exportedTypeBindings.end()) value = found->second;
    }
    else throw RequestError("Invalid native TypeFun lookup");
    if (!value) throw RequestError("Missing native TypeFun: " + name);
    if (value->typeParams.size() > 256 || value->typePackParams.size() > 256)
        throw RequestError("Native TypeFun observation limit");
    TypeFunFacts facts;
    facts.type = retain(handle, value->type);
    facts.definitionLocation = value->definitionLocation;
    for (const auto& parameter : value->typeParams)
    {
        facts.parameters.push_back(retain(handle, parameter.ty));
        facts.defaults.push_back(parameter.defaultValue ? std::make_optional(retain(handle, *parameter.defaultValue)) : std::nullopt);
    }
    for (const auto& parameter : value->typePackParams)
    {
        facts.packParameters.push_back(retainPack(handle, parameter.tp));
        facts.packDefaults.push_back(parameter.defaultValue ? std::make_optional(retainPack(handle, *parameter.defaultValue)) : std::nullopt);
    }
    return facts;
}
std::vector<ScopeFacts> Session::scopes(Handle handle, const std::string& module)
{
    result(handle);
    auto native = get().getFrontend().moduleResolver.getModule(module);
    if (!native) throw RequestError("Missing native module");
    if (native->scopes.size() > 256) throw RequestError("Native scope observation limit");
    std::vector<ScopeFacts> facts;
    for (const auto& [span, scope] : native->scopes)
    {
        if (scope->importedModules.size() > 256 || scope->typeAliasNameLocations.size() > 256)
            throw RequestError("Native scope map observation limit");
        ScopeFacts value;
        value.location = span;
        value.imports.insert(scope->importedModules.begin(), scope->importedModules.end());
        value.aliases.insert(scope->typeAliasNameLocations.begin(), scope->typeAliasNameLocations.end());
        facts.push_back(std::move(value));
    }
    return facts;
}
TypeHandle Session::child(TypeHandle handle, const std::string& selector, const std::string& name, size_t index)
{
    auto value = Luau::follow(type(handle));
    auto table = Luau::get<Luau::TableType>(value);
    auto external = Luau::get<Luau::ExternType>(value);
    if (selector == "read" || selector == "write")
    {
        const auto* props = table ? &table->props : external ? &external->props : nullptr;
        if (!props) throw RequestError("Native type has no own properties");
        auto found = props->find(name);
        if (found == props->end()) throw RequestError("Missing native own property: " + name);
        auto selected = selector == "read" ? found->second.readTy : found->second.writeTy;
        if (!selected) throw RequestError("Absent native property direction");
        return retain(handle.result, *selected);
    }
    if (selector == "index" || selector == "indexResult")
    {
        auto indexer = table ? table->indexer : external ? external->indexer : std::nullopt;
        if (!indexer) throw RequestError("Absent native indexer");
        return retain(handle.result, selector == "index" ? indexer->indexType : indexer->indexResultType);
    }
    if (selector == "parent" && external && external->parent) return retain(handle.result, *external->parent);
    if (selector == "metatable")
    {
        if (external && external->metatable) return retain(handle.result, *external->metatable);
        if (auto meta = Luau::get<Luau::MetatableType>(value)) return retain(handle.result, meta->metatable);
    }
    if (selector == "table")
        if (auto meta = Luau::get<Luau::MetatableType>(value)) return retain(handle.result, meta->table);
    if (selector == "option")
    {
        if (auto unionType = Luau::get<Luau::UnionType>(value))
        {
            if (index >= unionType->options.size()) throw RequestError("Invalid native union option");
            return retain(handle.result, unionType->options[index]);
        }
    }
    if (selector == "generic")
        if (auto function = Luau::get<Luau::FunctionType>(value))
        {
            if (index >= function->generics.size()) throw RequestError("Invalid native generic index");
            return retain(handle.result, function->generics[index]);
        }
    if (selector == "typeParameter" && table)
    {
        if (index >= table->instantiatedTypeParams.size()) throw RequestError("Invalid native type parameter index");
        return retain(handle.result, table->instantiatedTypeParams[index]);
    }
    throw RequestError("Absent or invalid native child selector: " + selector);
}
TypeFacts Session::facts(TypeHandle handle) const
{
    auto raw = type(handle);
    TypeFacts facts;
    facts.rawTable = bool(Luau::get<Luau::TableType>(raw));
    facts.rawPersistent = raw->persistent;
    auto value = Luau::follow(raw);
    facts.documentation = value->documentationSymbol;
    if (const auto* name = Luau::getName(value)) facts.name = *name;
    if (auto table = Luau::get<Luau::TableType>(value)) {
        facts.kind = "table"; facts.ownProperties = table->props.size();
        facts.tableLevel = table->level;
        facts.tableScopeIsGlobal = std::visit([&](const auto& owner) { return table->scope == owner->currentGlobalScope(); }, fixture);
        if (table->indexer) facts.indexerIsReadOnly = table->indexer->isReadOnly;
        facts.typeParameters = table->instantiatedTypeParams.size(); facts.packParameters = table->instantiatedTypePackParams.size(); }
    else if (auto external = Luau::get<Luau::ExternType>(value)) {
        facts.kind = "extern"; facts.ownProperties = external->props.size();
        facts.name = external->name;
        facts.definitionModuleName = external->definitionModuleName; }
    else if (auto function = Luau::get<Luau::FunctionType>(value)) {
        facts.kind = "function"; facts.definition = function->definition; facts.hasSelf = function->hasSelf;
        facts.generics = function->generics.size(); facts.genericPacks = function->genericPacks.size(); }
    else if (auto generic = Luau::get<Luau::GenericType>(value)) { facts.kind = "generic"; facts.polarity = int(generic->polarity); }
    else if (Luau::get<Luau::UnionType>(value)) facts.kind = "union";
    else if (Luau::get<Luau::MetatableType>(value)) facts.kind = "metatable";
    else if (auto primitive = Luau::get<Luau::PrimitiveType>(value)) { facts.kind = "primitive"; facts.primitive = int(primitive->type); }
    else facts.kind = Luau::visit(TypeKind{}, value->ty);
    return facts;
}
std::vector<std::string> Session::propertyNames(TypeHandle handle) const
{
    auto value = Luau::follow(type(handle));
    const auto* props = Luau::get<Luau::TableType>(value) ? &Luau::get<Luau::TableType>(value)->props :
        Luau::get<Luau::ExternType>(value) ? &Luau::get<Luau::ExternType>(value)->props : nullptr;
    if (!props) throw RequestError("Native type has no own properties");
    if (props->size() > 256) throw RequestError("Native property observation limit");
    std::vector<std::string> names;
    for (const auto& [name, property] : *props) names.push_back(name);
    return names;
}
PropertyFacts Session::propertyFacts(TypeHandle handle, const std::string& name) const
{
    auto value = Luau::follow(type(handle));
    auto table = Luau::get<Luau::TableType>(value);
    auto external = Luau::get<Luau::ExternType>(value);
    const auto* props = table ? &table->props : external ? &external->props : nullptr;
    if (!props) throw RequestError("Native type has no own properties");
    auto found = props->find(name);
    if (found == props->end()) throw RequestError("Missing native own property: " + name);
    const auto& property = found->second;
    return {bool(property.readTy), bool(property.writeTy), property.documentationSymbol, property.location, property.typeLocation};
}
TypeHandle Session::errorType(Handle handle, size_t index, bool wanted)
{
    const auto& errors = result(handle).errors;
    if (index >= errors.size()) throw RequestError("Invalid native diagnostic index");
    auto mismatch = Luau::get<Luau::TypeMismatch>(errors[index]);
    if (!mismatch) throw RequestError("Native diagnostic is not TypeMismatch");
    return retain(handle, wanted ? mismatch->wantedType : mismatch->givenType);
}
PackFacts Session::functionPack(TypeHandle handle, bool arguments, bool flattened)
{
    return packFacts(selectedPack(handle, arguments ? "arguments" : "returns", 0), flattened);
}
PackFacts Session::packFacts(PackHandle handle, bool flattened)
{
    auto pack = Luau::follow(this->pack(handle));
    PackFacts facts;
    auto direct = Luau::get<Luau::TypePack>(pack);
    facts.direct = bool(direct);
    std::vector<Luau::TypeId> head;
    std::optional<Luau::TypePackId> tail;
    if (flattened) { auto result = Luau::flatten(pack); head = std::move(result.first); tail = result.second; }
    else if (direct) { head = direct->head; tail = direct->tail; }
    else tail = pack;
    if (head.size() > 256) throw RequestError("Native pack observation limit");
    for (auto value : head) facts.head.push_back(retain(handle.result, value));
    facts.tail = bool(tail);
    if (tail)
    {
        facts.tailHandle = retainPack(handle.result, *tail);
        auto value = Luau::follow(*tail);
        facts.tailKind = Luau::get<Luau::TypePack>(value) ? "pack" : Luau::get<Luau::VariadicTypePack>(value) ? "variadic" :
            Luau::get<Luau::GenericTypePack>(value) ? "generic" : Luau::visit(PackKind{}, value->ty);
    }
    facts.size = Luau::size(pack);
    facts.finite = Luau::finite(pack);
    return facts;
}

void Session::synthetic(const std::string& kind)
{
    if (kind != "cyclicUnion" && kind != "asymmetricExtern" && kind != "variadicFunctions")
        throw RequestError("Unknown audited native graph setup");
    if (preset != Preset::Fixture) throw RequestError("Synthetic graph requires exact Fixture preset");
    if (!graphSetupAllowed) throw RequestError("Synthetic graph requires fresh fixture before sources, definitions or checks");
    graphSetupAllowed = false;
    invalidateResults();
    auto& frontend = get().getFrontend();
    auto& arena = frontend.globals.globalTypes;
    auto scope = frontend.globals.globalScope;
    auto builtins = get().getBuiltins();
    Luau::unfreeze(arena);
    try
    {
        if (kind == "cyclicUnion")
        {
            // Exact TypeInfer.unionTypes.test.cpp indexing_into_a_cyclic_union_doesnt_crash setup.
            auto cyclic = arena.freshType(builtins, scope.get());
            Luau::UnionType unionType;
            unionType.options.push_back(cyclic);
            unionType.options.push_back(arena.addType(Luau::TableType{{},
                Luau::TableIndexer{builtins->numberType, builtins->numberType}, Luau::TypeLevel{}, scope.get(), Luau::TableState::Sealed}));
            Luau::asMutable(cyclic)->ty.emplace<Luau::UnionType>(std::move(unionType));
            scope->exportedTypeBindings["BadCyclicUnion"] = Luau::TypeFun{{}, cyclic};
        }
        else if (kind == "asymmetricExtern")
        {
            // Exact TypeInfer.externTypes.test.cpp read_write_class_properties graph.
            auto instance = arena.addType(Luau::ExternType{"Instance", {}, {}, {}, {}, {}, "Test", {}});
            Luau::getMutable<Luau::ExternType>(instance)->props = {{"Parent", Luau::Property::rw(instance)}};
            auto workspace = arena.addType(Luau::ExternType{"Workspace", {}, {}, {}, {}, {}, "Test", {}});
            auto script = arena.addType(Luau::ExternType{"Script", {{"Parent", Luau::Property::rw(workspace, instance)}},
                instance, {}, {}, {}, "Test", {}});
            auto part = arena.addType(Luau::ExternType{"Part", {{"BrickColor", Luau::Property::rw(builtins->stringType)},
                {"Parent", Luau::Property::rw(workspace, instance)}}, instance, {}, {}, {}, "Test", {}});
            Luau::getMutable<Luau::ExternType>(workspace)->props = {{"Script", Luau::Property::readonly(script)},
                {"Part", Luau::Property::readonly(part)}};
            scope->bindings[frontend.globals.globalNames.names->getOrAdd("script")] = Luau::Binding{script};
        }
        else
        {
            // Exact TypeInfer.typePacks.test.cpp variadic_packs graph.
            auto numbers = arena.addTypePack(Luau::TypePackVar{Luau::VariadicTypePack{builtins->numberType}});
            auto strings = arena.addTypePack(Luau::TypePackVar{Luau::VariadicTypePack{builtins->stringType}});
            Luau::addGlobalBinding(frontend.globals, "foo", arena.addType(Luau::FunctionType{numbers,
                arena.addTypePack({builtins->numberType})}), "@test");
            Luau::addGlobalBinding(frontend.globals, "bar", arena.addType(Luau::FunctionType{
                arena.addTypePack(Luau::TypePack{{builtins->numberType}, strings}), arena.addTypePack({builtins->numberType})}), "@test");
        }
    }
    catch (...) { Luau::freeze(arena); throw; }
    Luau::freeze(arena);
}
void Session::hiddenTypes()
{
    if (preset != Preset::Fixture || !graphSetupAllowed) throw RequestError("Hidden types require fresh exact Fixture preset");
    invalidateResults();
    graphSetupAllowed = false;
    Luau::registerHiddenTypes(get().getFrontend());
}
void Session::retainGraphs(bool enabled)
{
    if (!graphSetupAllowed) throw RequestError("Graph retention must precede sources, definitions and checks");
    get().getFrontend().options.retainFullTypeGraphs = enabled;
}
void Session::clearFrontend()
{
    invalidateResults();
    graphSetupAllowed = false;
    // Keep exactly the same fixture/global arenas. This is not Session::reset.
    get().getFrontend().clear();
}

Luau::TypeId Session::type(TypeHandle handle) const
{
    validate(handle.result);
    if (handle.index >= types.size()) throw RequestError("Invalid native type handle");
    return types[handle.index];
}
std::string Session::printed(TypeHandle handle, bool exhaustive) const { return Luau::toString(type(handle), Luau::ToStringOptions(exhaustive)); }
std::string Session::printedOptions(TypeHandle handle, unsigned options, int maxTableLength) const { return Luau::toString(type(handle), printOptions(options, maxTableLength)); }
std::string Session::printedPackOptions(PackHandle handle, unsigned options, int maxTableLength) const { return Luau::toString(pack(handle), printOptions(options, maxTableLength)); }
bool Session::subtype(TypeHandle sub, TypeHandle super)
{
    auto a = type(sub), b = type(super);
    result(sub.result);
    auto module = get().getMainModule();
    if (!module || !module->hasModuleScope()) throw RequestError("Native subtype requires main module scope");
    // Exact selected-New IsSubtypeFixture::isSubtype setup, with failed preconditions
    // propagated as operations instead of doctest REQUIRE/FAIL outside a running test.
    auto& fixture = get();
    Luau::UnifierSharedState sharedState{&fixture.ice};
    Luau::NotNull<Luau::Scope> scope{module->getModuleScope().get()};
    auto builtins = fixture.getBuiltins();
    Luau::Normalizer normalizer{&fixture.arena, builtins, Luau::NotNull{&sharedState}, Luau::SolverMode::New};
    Luau::TypeArena arena;
    Luau::TypeCheckLimits limits;
    Luau::TypeFunctionRuntime runtime{Luau::NotNull{&fixture.ice}, Luau::NotNull{&limits}};
    Luau::Subtyping subtyping{builtins, Luau::NotNull{&arena}, Luau::NotNull{&normalizer}, Luau::NotNull{&runtime}, Luau::NotNull{&fixture.ice}};
    return subtyping.isSubtype(a, b, scope).isSubtype;
}
bool Session::identical(TypeHandle left, TypeHandle right) const { return type(left) == type(right); }
std::optional<Luau::TableState> Session::tableState(TypeHandle handle) const
{
    if (auto table = Luau::get<Luau::TableType>(Luau::follow(type(handle)))) return table->state;
    return std::nullopt;
}
bool Session::mismatchEquals(Handle handle, size_t error, TypeHandle wanted, TypeHandle given) const
{
    const auto& errors = result(handle).errors;
    if (error >= errors.size()) throw RequestError("Invalid native diagnostic index");
    return Luau::TypeErrorData(Luau::TypeMismatch{type(wanted), type(given)}) == errors[error].data;
}
size_t Session::firstErrorAt(Handle handle, Luau::Position begin) const
{
    const auto& errors = result(handle).errors;
    for (size_t i = 0; i < errors.size(); ++i) if (errors[i].location.begin == begin) return i;
    throw RequestError("No native diagnostic at selected begin position");
}

FunctionCapture Session::captureGlobalFunction(const std::string& global, const std::string& property)
{
    auto& frontend = get().getFrontend();
    auto value = Luau::lookupName(frontend.globals.globalScope, global);
    if (!value) throw RequestError("Missing native global");
    auto table = Luau::get<Luau::TableType>(Luau::follow(*value));
    if (!table) throw RequestError("Native global is not a table");
    auto found = table->props.find(property);
    if (found == table->props.end() || !found->second.readTy) throw RequestError("Missing readable native property");
    auto selected = *found->second.readTy;
    return captureFunction(selected);
}
FunctionCapture Session::captureType(TypeHandle handle) { return captureFunction(type(handle)); }
FunctionCapture Session::captureFunction(Luau::TypeId selected)
{
    auto& frontend = get().getFrontend();
    auto function = Luau::get<Luau::FunctionType>(selected);
    if (!function) throw RequestError("Native property is not a function");
    // registerBuiltinGlobals allocates ordinary globals in globalTypes, while
    // registerBuiltinString creates string.len in BuiltinTypes::arena
    // (pinned BuiltinDefinitions.cpp1214,1292). Both arenas belong to this fixture
    // and survive definition loads/Frontend.clear; neither is a module arena.
    // Type.cpp844-850 allocates numberType in that same private builtin arena;
    // its public owningArena is an actual arena identity, not a copied type.
    if (selected->owningArena != &frontend.globals.globalTypes && selected->owningArena != get().getBuiltins()->numberType->owningArena)
        throw RequestError("Native function capture requires fixture global or builtin arena ownership");
    if (captures.size() >= 64) throw RequestError("Native capture limit");
    captures.push_back({selected, function, function->level});
    return {id, environment, uint32_t(captures.size() - 1)};
}
CapturedLevels Session::levels(FunctionCapture handle) const
{
    if (handle.session != id || handle.environment != environment || handle.index >= captures.size())
        throw RequestError("Stale native function capture");
    const auto& capture = captures[handle.index];
    if (Luau::get<Luau::FunctionType>(capture.type) != capture.function)
        throw RequestError("Native captured function object replaced");
    return {capture.before, capture.function->level};
}
TypeHandle Session::capturedType(FunctionCapture capture, Handle result)
{
    validate(result);
    if (capture.session != id || capture.environment != environment || capture.index >= captures.size())
        throw RequestError("Stale native function capture");
    if (Luau::get<Luau::FunctionType>(captures[capture.index].type) != captures[capture.index].function)
        throw RequestError("Native captured function object replaced");
    // Rebind the SAME stored raw TypeId into the current result's bounded handle
    // table. This is not a lookup, clone, or an implicit follow operation.
    return retain(result, captures[capture.index].type);
}
void Session::reset()
{
    invalidateResults();
    captures.clear();
    ++environment;
    std::visit([](auto& owner) { owner.reset(); }, fixture);
    graphSetupAllowed = true;
    bodyNewSolverSelected = false;
    initialize();
}
std::variant<bool, int> Session::effectiveFlag(const std::string& name)
{
    if (auto value = findFlag<bool>(name)) return value->value;
    if (auto value = findFlag<int>(name)) return value->value;
    throw RequestError("Unknown native flag: " + name);
}
}
