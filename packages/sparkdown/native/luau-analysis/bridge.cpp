// Minimal production ABI for Luau 7d5f73364fdbbaa984fa545071630eba73cfea98 (MIT).
#include "Luau/Frontend.h"
#include "Luau/BuiltinDefinitions.h"
#include "Luau/AstQuery.h"
#include "Luau/ToString.h"
#include "Luau/TypePack.h"
#include "Luau/Parser.h"
#include "Luau/RequireTracer.h"
#include "ast-input.h"
#include "incremental-scopes.h"
#include <emscripten/emscripten.h>
#include <emscripten/heap.h>
#include <algorithm>
#include <memory>
#include <map>
#include <sstream>
#include <set>
#include <vector>
#include <cstdlib>

namespace {
std::string quote(const std::string& s) {
    std::string r = "\"";
    const char hex[] = "0123456789abcdef";
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') { r += '\\'; r += char(c); }
        else if (c < 32) { r += "\\u00"; r += hex[c >> 4]; r += hex[c & 15]; }
        else r += char(c);
    }
    return r + "\"";
}
std::string location(const Luau::Location& l);
// Exhaustive for the pinned TypeErrorData; adding an upstream alternative must
// fail compilation rather than silently deriving a kind from diagnostic text.
struct ErrorKind {
#define ERROR_KIND(Name) const char* operator()(const Luau::Name&) const { return #Name; }
    ERROR_KIND(TypeMismatch) ERROR_KIND(UnknownSymbol) ERROR_KIND(UnknownProperty) ERROR_KIND(NotATable)
    ERROR_KIND(CannotExtendTable) ERROR_KIND(CannotCompareUnrelatedTypes) ERROR_KIND(OnlyTablesCanHaveMethods)
    ERROR_KIND(DuplicateTypeDefinition) ERROR_KIND(CountMismatch) ERROR_KIND(FunctionDoesNotTakeSelf)
    ERROR_KIND(FunctionRequiresSelf) ERROR_KIND(OccursCheckFailed) ERROR_KIND(UnknownRequire)
    ERROR_KIND(IncorrectGenericParameterCount) ERROR_KIND(SyntaxError) ERROR_KIND(CodeTooComplex)
    ERROR_KIND(UnificationTooComplex) ERROR_KIND(UnknownPropButFoundLikeProp) ERROR_KIND(GenericError)
    ERROR_KIND(InternalError) ERROR_KIND(ConstraintSolvingIncompleteError) ERROR_KIND(CannotCallNonFunction)
    ERROR_KIND(ExtraInformation) ERROR_KIND(DeprecatedApiUsed) ERROR_KIND(ModuleHasCyclicDependency)
    ERROR_KIND(CyclicModuleTopLevelAccess) ERROR_KIND(IllegalRequire) ERROR_KIND(FunctionExitsWithoutReturning)
    ERROR_KIND(DuplicateGenericParameter) ERROR_KIND(CannotAssignToNever) ERROR_KIND(CannotInferBinaryOperation)
    ERROR_KIND(MissingProperties) ERROR_KIND(SwappedGenericTypeParameter) ERROR_KIND(OptionalValueAccess)
    ERROR_KIND(MissingUnionProperty) ERROR_KIND(TypesAreUnrelated) ERROR_KIND(NormalizationTooComplex)
    ERROR_KIND(TypePackMismatch) ERROR_KIND(DynamicPropertyLookupOnExternTypesUnsafe) ERROR_KIND(UninhabitedTypeFunction)
    ERROR_KIND(UninhabitedTypePackFunction) ERROR_KIND(WhereClauseNeeded) ERROR_KIND(PackWhereClauseNeeded)
    ERROR_KIND(CheckedFunctionCallError) ERROR_KIND(NonStrictFunctionDefinitionError) ERROR_KIND(PropertyAccessViolation)
    ERROR_KIND(CheckedFunctionIncorrectArgs) ERROR_KIND(UnexpectedTypeInSubtyping) ERROR_KIND(UnexpectedTypePackInSubtyping)
    ERROR_KIND(ExplicitFunctionAnnotationRecommended) ERROR_KIND(UserDefinedTypeFunctionError) ERROR_KIND(BuiltInTypeFunctionError)
    ERROR_KIND(ReservedIdentifier) ERROR_KIND(UnexpectedArrayLikeTableItem) ERROR_KIND(CannotCheckDynamicStringFormatCalls)
    ERROR_KIND(GenericTypeCountMismatch) ERROR_KIND(GenericTypePackCountMismatch) ERROR_KIND(MultipleNonviableOverloads)
    ERROR_KIND(RecursiveRestraintViolation) ERROR_KIND(GenericBoundsMismatch) ERROR_KIND(UnappliedTypeFunction)
    ERROR_KIND(InstantiateGenericsOnNonFunction) ERROR_KIND(TypeInstantiationCountMismatch) ERROR_KIND(AmbiguousFunctionCall)
    ERROR_KIND(UninitializedFieldAccess) ERROR_KIND(TypeAnnotationRequired) ERROR_KIND(ConstructorsShouldNotReturnAnything)
#undef ERROR_KIND
};
std::string diagnostic(const Luau::TypeError& e, Luau::FileResolver* files = nullptr, std::optional<size_t> parseOrdinal = std::nullopt) {
    std::string facts = ",\"kind\":" + quote(Luau::visit(ErrorKind{}, e.data));
    if (auto symbol = Luau::get<Luau::UnknownSymbol>(e)) facts += ",\"unknownSymbol\":{\"name\":" + quote(symbol->name)
        + ",\"context\":" + quote(symbol->context == Luau::UnknownSymbol::Binding ? "binding" : "type") + "}";
    if (parseOrdinal) facts += ",\"parseErrorOrdinal\":" + std::to_string(*parseOrdinal);
    return "{\"module\":" + quote(e.moduleName) + ",\"code\":" + std::to_string(e.code()) +
        facts + ",\"message\":" + quote(Luau::toString(e, Luau::TypeErrorToStringOptions{files})) + ",\"range\":" + location(e.location) + "}";
}
struct DefinitionFailure : std::runtime_error {
    std::string diagnostics;
    DefinitionFailure(const std::string& name, std::string diagnostics)
        : std::runtime_error("Invalid definition file: " + name), diagnostics(std::move(diagnostics)) {}
};
struct Files : Luau::FileResolver {
    struct Resolution {
        std::string target, sourceUri;
        bool operator==(const Resolution& other) const { return target == other.target && sourceUri == other.sourceUri; }
    };
    std::map<std::string, std::string> sources;
    std::map<std::string, std::string> identities;
    std::map<std::string, std::map<std::string, Resolution>> resolutions;
    std::string getHumanReadableModuleName(const Luau::ModuleName& name) const override {
        auto identity = identities.find(name); if (identity != identities.end()) return identity->second;
        for (const auto& [context, edges] : resolutions) for (const auto& [specifier, edge] : edges)
            if (edge.target == name) return edge.sourceUri;
        return name;
    }
    std::optional<Luau::SourceCode> readSource(const Luau::ModuleName& name) override {
        auto i = sources.find(name);
        return i == sources.end() ? std::nullopt : std::optional<Luau::SourceCode>{{i->second, Luau::SourceCode::Module}};
    }
    std::optional<Luau::ModuleInfo> resolveModule(const Luau::ModuleInfo* context, Luau::AstExpr* expr, const Luau::TypeCheckLimits&) override {
        if (auto s = expr->as<Luau::AstExprConstantString>()) {
            std::string name(s->value.data, s->value.size);
            if (context) {
                auto edges = resolutions.find(context->name);
                if (edges != resolutions.end()) {
                    auto target = edges->second.find(name);
                    if (target != edges->second.end()) return Luau::ModuleInfo{target->second.target};
                }
                // Opaque Sparkdown contexts have only the host's explicit
                // policy. An unmapped specifier stays a real unknown require.
                if (identities.count(context->name)) return std::nullopt;
            }
            if (context && name.compare(0, 2, "./") == 0) {
                auto slash = context->name.rfind('/');
                name = (slash == std::string::npos ? "" : context->name.substr(0, slash + 1)) + name.substr(2);
            }
            return Luau::ModuleInfo{name};
        }
        return std::nullopt;
    }
};
struct Config : Luau::ConfigResolver {
    Luau::Config value;
    std::map<std::string, Luau::Config> modules;
    const Luau::Config& getConfig(const Luau::ModuleName& name, const Luau::TypeCheckLimits&) const override {
        auto i = modules.find(name); return i == modules.end() ? value : i->second;
    }
};
struct Project {
    Files files;
    Config config;
    std::map<std::string, std::string> definitions;
    std::vector<std::string> definitionOrder;
    SparkdownAnalysis::IncrementalScopes scopes;
    std::vector<std::string> programValues, programTypes, stagedValues, stagedTypes;
    bool stagingEnvironment = false;
    std::optional<std::string> resolutionContext;
    std::map<std::string, Files::Resolution> stagedResolutions;
    std::unique_ptr<Luau::Frontend> frontend;
    std::map<std::string, std::shared_ptr<Luau::SourceModule>> astInputs;
    std::map<std::string, std::string> astBytes;
    std::map<std::string, size_t> sourceGenerations;
    std::map<std::string, std::vector<size_t>> sourceLineStarts;
    size_t nextSourceGeneration = 0;
    // Incoming missing-file edges survive the native SourceNode's removal.
    std::map<std::string, std::set<std::string>> inputRequires, inputDependents;
    size_t checked = 0;
    Project(int mode) { config.value.mode = Luau::Mode(mode); }
    std::optional<SparkdownAnalysis::SourceLocationFact> sourceLocation(const std::string& name, const Luau::Location& range) const {
        auto generation = sourceGenerations.find(name);
        if (generation == sourceGenerations.end()) return std::nullopt;
        if (astInputs.count(name)) return SparkdownAnalysis::SourceLocationFact{name, range, generation->second};
        auto source = files.sources.find(name);
        if (source == files.sources.end()) return std::nullopt;
        auto lines = sourceLineStarts.find(name);
        if (lines == sourceLineStarts.end()) return std::nullopt;
        auto position = [&](Luau::Position input) -> std::optional<Luau::Position> {
            const auto& text = source->second;
            if (input.line >= lines->second.size()) return std::nullopt;
            const size_t start = lines->second[input.line];
            const size_t end = input.line + 1 < lines->second.size() ? lines->second[input.line + 1] - 1 : text.size();
            if (input.column > end - start) return std::nullopt;
            size_t bytes = 0, units = 0;
            while (bytes < input.column) {
                const unsigned char c = text[start + bytes];
                const size_t width = c < 0x80 ? 1 : (c & 0xe0) == 0xc0 ? 2 : (c & 0xf0) == 0xe0 ? 3 : (c & 0xf8) == 0xf0 ? 4 : 0;
                if (!width || bytes + width > input.column) return std::nullopt;
                for (size_t i = 1; i < width; ++i) if ((static_cast<unsigned char>(text[start + bytes + i]) & 0xc0) != 0x80) return std::nullopt;
                bytes += width; units += width == 4 ? 2 : 1;
            }
            return Luau::Position(input.line, unsigned(units));
        };
        auto begin = position(range.begin), end = position(range.end);
        if (!begin || !end) return std::nullopt;
        return SparkdownAnalysis::SourceLocationFact{name, Luau::Location(*begin, *end), generation->second};
    }
    ~Project() {
        // Drop checked/query graphs while every borrowed/global arena is live.
        if (frontend) frontend->clear();
        scopes.clearChecked();
    }
    void replaceEdges(const std::string& name, const std::set<std::string>& next) {
        auto prior = inputRequires.find(name);
        if (prior != inputRequires.end()) for (const auto& dependency : prior->second) {
            auto incoming = inputDependents.find(dependency);
            if (incoming != inputDependents.end()) {
                incoming->second.erase(name);
                if (incoming->second.empty()) inputDependents.erase(incoming);
            }
        }
        if (next.empty()) inputRequires.erase(name); else inputRequires[name] = next;
        for (const auto& dependency : next) inputDependents[dependency].insert(name);
    }
    void retainDecodedSources() {
        for (const auto& [name, source] : astInputs) {
            // Frontend::check stores its effective mode back into SourceModule.
            // Retaining the AST must retain only the authored directive here;
            // otherwise an earlier strict check overrides a later module mode.
            source->mode = Luau::parseMode(source->hotcomments);
            auto node = frontend->sourceNodes.find(name);
            auto installed = frontend->sourceModules.find(name);
            if (node != frontend->sourceNodes.end() && installed != frontend->sourceModules.end() && installed->second == source)
                node->second->dirtySourceModule = false;
        }
    }
    void dirty(const std::string& changed) {
        std::vector<std::string> pending{changed};
        std::set<std::string> visited;
        for (const auto& [name, node] : frontend->sourceNodes)
            if (node->requireSet.contains(changed)) pending.push_back(name);
        while (!pending.empty()) {
            auto name = pending.back(); pending.pop_back();
            if (!visited.insert(name).second) continue;
            frontend->markDirty(name);
            auto incoming = inputDependents.find(name);
            if (incoming != inputDependents.end())
                pending.insert(pending.end(), incoming->second.begin(), incoming->second.end());
        }
        retainDecodedSources();
    }
    void install(const std::string& name, const std::shared_ptr<Luau::SourceModule>& source) {
        source->mode = Luau::parseMode(source->hotcomments);
        auto prior = frontend->sourceNodes.find(name);
        if (prior != frontend->sourceNodes.end()) for (const auto& dependency : prior->second->requireSet) {
            auto target = frontend->sourceNodes.find(dependency);
            if (target != frontend->sourceNodes.end()) target->second->dependents.erase(name);
        }
        auto trace = Luau::traceRequires(&files, source->root, name, Luau::TypeCheckLimits{});
        auto& node = frontend->sourceNodes[name];
        if (!node) node = std::make_shared<Luau::SourceNode>();
        node->name = name; node->humanReadableName = files.getHumanReadableModuleName(name);
        source->humanReadableName = node->humanReadableName;
        node->requireSet.clear(); node->requireLocations = trace.requireList;
        for (const auto& [dependency, location] : trace.requireList) node->requireSet.insert(dependency);
        replaceEdges(name, std::set<std::string>(node->requireSet.begin(), node->requireSet.end()));
        node->dirtySourceModule = false; node->dirtyModule = true; node->dirtyModuleForAutocomplete = true;
        node->invalidModuleDependency = node->invalidModuleDependencyForAutocomplete = true;
        frontend->sourceModules[name] = source; frontend->requireTrace[name] = std::move(trace);
    }
    void remove(const std::string& name) {
        dirty(name);
        for (const auto& consumer : scopes.consumers(name)) dirty(consumer);
        scopes.remove(*frontend, name);
        frontend->clearModules({name});
        replaceEdges(name, {});
        astInputs.erase(name); astBytes.erase(name); files.sources.erase(name);
        sourceGenerations.erase(name);
        sourceLineStarts.erase(name);
        files.identities.erase(name); files.resolutions.erase(name);
        config.modules.erase(name); scopes.collect();
        retainDecodedSources();
    }
    void retrace(const std::string& name) {
        dirty(name);
        auto ast = astInputs.find(name);
        if (ast != astInputs.end()) install(name, ast->second);
        retainDecodedSources();
    }
    void reset() {
        // Borrowed graphs are released before their builtin/global arena.
        if (frontend) frontend->clear();
        scopes.clearChecked();
        scopes.programBindings(programValues, programTypes);
        Luau::FrontendOptions options;
        options.retainFullTypeGraphs = true;
        options.customModuleCheck = [this](const Luau::SourceModule&, const Luau::Module&) { ++checked; };
        frontend = std::make_unique<Luau::Frontend>(Luau::SolverMode::New, &files, &config, options);
        frontend->prepareModuleScope = [this](const Luau::ModuleName& name, const Luau::ScopePtr& scope, bool) {
            scopes.prepare(*frontend, name, scope);
            auto input = astInputs.find(name);
            if (input != astInputs.end()) SparkdownAnalysis::prepareSyntheticBindings(*input->second, scope, *frontend->builtinTypes);
        };
        frontend->prepareTypeFunctionScope = [this](const Luau::ModuleName& name, const Luau::ScopePtr& scope, bool) {
            scopes.prepareTypeFunctions(*frontend, name, scope);
        };
        Luau::unfreeze(frontend->globals.globalTypes);
        Luau::registerBuiltinGlobals(*frontend, frontend->globals);
        for (const auto& name : definitionOrder) {
            const auto& source = definitions.at(name);
            auto r = frontend->loadDefinitionFile(frontend->globals, frontend->globals.globalScope, source, name, false);
            if (!r.success) {
                std::string diagnostics = "[";
                bool first = true;
                if (r.module) for (const auto& e : r.module->errors) {
                    if (!first) diagnostics += ','; first = false;
                    auto copy = e; copy.moduleName = name; diagnostics += diagnostic(copy);
                }
                for (const auto& e : r.parseResult.errors) {
                    if (!first) diagnostics += ','; first = false;
                    diagnostics += diagnostic(Luau::TypeError(e.getLocation(), name, Luau::SyntaxError{e.getMessage()}));
                }
                throw DefinitionFailure(name, diagnostics + "]");
            }
        }
        Luau::freeze(frontend->globals.globalTypes);
        for (const auto& [name, source] : astInputs) install(name, source);
    }
    void checkScoped(const std::string& name, const Luau::FrontendOptions& options, std::set<std::string>& active, std::set<std::string>& done) {
        if (done.count(name)) return;
        if (active.size() >= 1024) throw std::runtime_error("Prelude relationship traversal exceeds 1024 active modules");
        if (!files.sources.count(name)) throw std::runtime_error("Missing linked prelude module: " + name);
        if (!active.insert(name).second) throw std::runtime_error("Cyclic require/prelude scope relationship");
        // Public parse() prepares only the ordinary require graph. AST inputs
        // remain installed/clean and are not reparsed through placeholders.
        frontend->parse(name);
        std::set<std::string> reachable;
        std::vector<std::string> queue{name};
        while (!queue.empty()) {
            auto current = queue.back(); queue.pop_back();
            if (!reachable.insert(current).second) continue;
            auto node = frontend->sourceNodes.find(current);
            if (node != frontend->sourceNodes.end()) for (const auto& dependency : node->second->requireSet) queue.push_back(dependency);
        }
        for (const auto& current : reachable) {
            auto target = scopes.preludeOf(current);
            if (!target.empty()) checkScoped(target, options, active, done);
        }
        auto checkedResult = frontend->check(name, options);
        if (!checkedResult.timeoutHits.empty()) throw Luau::TimeLimitError(name);
        for (const auto& current : reachable) {
            auto module = frontend->moduleResolver.getModule(current);
            if (module && module->cancelled) throw std::runtime_error("Module check was cancelled");
            if (module && module->timeout) throw Luau::TimeLimitError(current);
            if (module) scopes.checked(*frontend, current, [this](const std::string& origin, const Luau::Location& range) { return sourceLocation(origin, range); });
            if (module && scopes.isPrelude(current) && !scopes.publish(*frontend, current))
                for (const auto& consumer : scopes.consumers(current)) dirty(consumer);
        }
        active.erase(name); done.insert(name); scopes.collect();
    }
};
std::unique_ptr<Project> project;
std::string result;
template<class F> const char* guard(F fn) {
    try { result = fn(); }
    catch (const std::bad_alloc&) { project.reset(); result = "{\"status\":\"memory-limit\"}"; }
    catch (const Luau::TimeLimitError&) { project.reset(); result = "{\"status\":\"deadline\"}"; }
    catch (const DefinitionFailure& e) { project.reset(); result = "{\"status\":\"error\",\"message\":" + quote(e.what()) + ",\"diagnostics\":" + e.diagnostics + "}"; }
    catch (const std::exception& e) { project.reset(); result = "{\"status\":\"error\",\"message\":" + quote(e.what()) + "}"; }
    return result.c_str();
}
Project& get() { if (!project) throw std::runtime_error("Session requires reset"); return *project; }
std::string location(const Luau::Location& l) {
    return "{\"start\":{\"line\":" + std::to_string(l.begin.line) + ",\"column\":" + std::to_string(l.begin.column) +
        "},\"end\":{\"line\":" + std::to_string(l.end.line) + ",\"column\":" + std::to_string(l.end.column) + "}}";
}
std::optional<Luau::TypeId> selectedType(const Luau::Module& module, const Luau::SourceModule& source, Luau::Position position) {
    if (Luau::isWithinComment(source, position)) return std::nullopt;
    std::optional<Luau::TypeId> type;
    if (auto local = Luau::findExprOrLocalAtPosition(source, position).getLocal())
        for (const auto& entry : module.scopes) {
            auto binding = entry.second->bindings.find(Luau::Symbol(local));
            if (binding != entry.second->bindings.end() && binding->second.location == local->location) {
                type = binding->second.typeId; break;
            }
        }
    if (!type) type = Luau::findTypeAtPosition(module, source, position);
    if (!type) if (auto expression = Luau::findExprAtPosition(source, position))
        if (auto pack = module.astTypePacks.find(expression)) type = Luau::first(*pack);
    if (!type) if (auto binding = Luau::findBindingAtPosition(module, source, position)) type = binding->typeId;
    return type;
}
std::string sourceFacts(const SparkdownAnalysis::SourceMetadataFacts& facts, size_t limit) {
    std::string json = "{\"complete\":" + std::string(facts.complete && facts.fields.size() <= limit ? "true" : "false") + ",\"fields\":[";
    for (size_t i = 0; i < facts.fields.size() && i < limit; ++i) {
        const auto& field = facts.fields[i]; if (i) json += ',';
        json += "{\"kind\":" + quote(field.kind) + ",\"name\":" + quote(field.name) + ",\"index\":" + std::to_string(field.index)
            + ",\"module\":" + quote(field.source.module) + ",\"sourceGeneration\":" + std::to_string(field.source.generation)
            + ",\"range\":" + location(field.source.range) + "}";
    }
    return json + "]}";
}
}
extern "C" {
EMSCRIPTEN_KEEPALIVE const char* analysis_create(int mode, int heap) {
    return guard([&] {
        // Each factory instance owns its own FValue lists. Never toggle shared host globals.
        for (auto f = Luau::FValue<bool>::list; f; f = f->next)
            if (std::string(f->name).compare(0, 4, "Luau") == 0) f->value = true;
        for (auto f = Luau::FValue<int>::list; f; f = f->next)
            if (std::string(f->name) == "DebugLuauTypeFunctionRuntimeHeapLimit") f->value = heap;
        project = std::make_unique<Project>(mode); project->reset();
        return std::string("{\"status\":\"ok\",\"abi\":1}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_set(const char* name, const char* source, int remove) {
    return guard([&] {
        auto& p = get();
        auto old = p.files.sources.find(name);
        bool changed = remove ? old != p.files.sources.end() : p.astInputs.count(name) || old == p.files.sources.end() || old->second != source;
        if (changed) {
            if (remove) {
                // Invalidate dependents before releasing ASTs, type graphs and traces.
                // Dirtying alone retains deleted modules indefinitely.
                p.remove(name);
            } else {
                p.dirty(name);
                if (p.astInputs.count(name)) {
                    p.frontend->clearModules({name});
                    p.replaceEdges(name, {});
                    p.astInputs.erase(name); p.astBytes.erase(name);
                }
                p.files.sources[name] = source;
                p.sourceGenerations[name] = ++p.nextSourceGeneration;
                auto& lines = p.sourceLineStarts[name]; lines = {0};
                for (size_t i = p.files.sources[name].find('\n'); i != std::string::npos; i = p.files.sources[name].find('\n', i + 1)) lines.push_back(i + 1);
                p.retainDecodedSources();
            }
        }
        return std::string("{\"status\":\"ok\",\"changed\":") + (changed ? "true}" : "false}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_set_ast(const char* name, const char* encoded, int remove) {
    return guard([&] {
        auto& p = get();
        if (remove) {
            bool changed = p.files.sources.count(name);
            if (changed) p.remove(name);
            return std::string("{\"status\":\"ok\",\"changed\":") + (changed ? "true}" : "false}");
        }
        auto prior = p.astBytes.find(name);
        if (prior != p.astBytes.end() && prior->second == encoded)
            return std::string("{\"status\":\"ok\",\"changed\":false,\"decodedInputs\":0}");
        auto source = SparkdownAnalysis::decodeAst(encoded, name);
        p.dirty(name);
        p.files.sources[name] = "";
        p.astInputs[name] = source; p.astBytes[name] = encoded;
        p.sourceGenerations[name] = ++p.nextSourceGeneration;
        p.sourceLineStarts.erase(name);
        p.install(name, source);
        p.retainDecodedSources();
        return std::string("{\"status\":\"ok\",\"changed\":true,\"decodedInputs\":1}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_definition(const char* name, const char* source, int remove) {
    return guard([&] {
        auto& p = get();
        if (remove) {
            p.definitions.erase(name);
            p.definitionOrder.erase(std::remove(p.definitionOrder.begin(), p.definitionOrder.end(), name), p.definitionOrder.end());
        } else {
            if (!p.definitions.count(name)) p.definitionOrder.push_back(name);
            p.definitions[name] = source;
        }
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_identity(const char* name, const char* sourceUri, int remove) {
    return guard([&] {
        auto& p = get(); auto prior = p.files.identities.find(name);
        bool changed = remove ? prior != p.files.identities.end() : prior == p.files.identities.end() || prior->second != sourceUri;
        if (changed) {
            if (remove) p.files.identities.erase(name); else p.files.identities[name] = sourceUri;
            p.retrace(name);
        }
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_resolution_begin(const char* name) {
    return guard([&] { auto& p = get(); p.resolutionContext = name; p.stagedResolutions.clear(); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_resolution_edge(const char* specifier, const char* target, const char* sourceUri) {
    return guard([&] {
        auto& p = get(); if (!p.resolutionContext) throw std::runtime_error("Missing module resolution stage");
        if (!p.stagedResolutions.emplace(specifier, Files::Resolution{target, sourceUri}).second) throw std::runtime_error("Duplicate module resolution specifier");
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_resolution_commit(int remove) {
    return guard([&] {
        auto& p = get(); if (!p.resolutionContext) throw std::runtime_error("Missing module resolution stage");
        auto name = *p.resolutionContext; p.resolutionContext.reset();
        auto prior = p.files.resolutions.find(name);
        bool changed = remove ? prior != p.files.resolutions.end() : prior == p.files.resolutions.end() || prior->second != p.stagedResolutions;
        if (changed) {
            if (remove) p.files.resolutions.erase(name); else p.files.resolutions[name] = std::move(p.stagedResolutions);
            p.retrace(name);
        }
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_commit_definitions() {
    return guard([&] { get().reset(); return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_environment_begin() {
    return guard([&] { auto& p = get(); p.stagedValues.clear(); p.stagedTypes.clear(); p.stagingEnvironment = true; return std::string("{\"status\":\"ok\"}"); });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_environment_binding(const char* name, int type) {
    return guard([&] {
        auto& p = get(); if (!p.stagingEnvironment || (type != 0 && type != 1)) throw std::runtime_error("Invalid program environment stage");
        for (const unsigned char c : std::string(name)) if (c < 32 || c == 127) throw std::runtime_error("Invalid program binding name");
        (type ? p.stagedTypes : p.stagedValues).push_back(name); return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_environment_commit(int definitionsChanged) {
    return guard([&] {
        auto& p = get(); if (!p.stagingEnvironment) throw std::runtime_error("Missing program environment stage");
        p.stagingEnvironment = false;
        bool changed = p.stagedValues != p.programValues || p.stagedTypes != p.programTypes;
        p.programValues = std::move(p.stagedValues); p.programTypes = std::move(p.stagedTypes);
        if (changed || definitionsChanged) p.reset();
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_scope(const char* name, const char* prelude, int remove) {
    return guard([&] {
        auto& p = get(); bool changed = remove ? p.scopes.unlink(*p.frontend, name) : p.scopes.link(name, prelude);
        if (changed) p.dirty(name);
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_mode(const char* name, int mode, int remove) {
    return guard([&] {
        auto& p = get(); if (mode < 0 || mode > 2) throw std::runtime_error("Unsupported module mode");
        auto prior = p.config.modules.find(name);
        bool changed = remove ? prior != p.config.modules.end() : prior == p.config.modules.end() || prior->second.mode != Luau::Mode(mode);
        if (changed) {
            if (remove) p.config.modules.erase(name);
            else { auto config = p.config.value; config.mode = Luau::Mode(mode); p.config.modules[name] = std::move(config); }
            p.dirty(name);
        }
        return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_check(const char* name, double seconds) {
    return guard([&] {
        auto& p = get();
        if (!p.files.sources.count(name)) throw std::runtime_error("Missing root module");
        auto options = p.frontend->options;
        options.moduleTimeLimitSec = seconds;
        p.checked = 0;
        size_t parsed = p.frontend->stats.files;
        double start = emscripten_get_now();
        std::set<std::string> active, done;
        p.checkScoped(name, options, active, done);
        double checkingMs = emscripten_get_now() - start;
        double encodingStart = emscripten_get_now();
        // check() reports only newly checked modules. The public replacement
        // snapshot must also include errors retained by cached dependencies.
        auto complete = p.frontend->getCheckResult(name, true);
        if (!complete) throw std::runtime_error("Module check did not produce a complete result");
        if (!complete->timeoutHits.empty()) { project.reset(); return std::string("{\"status\":\"deadline\"}"); }
        // Replacement coverage includes cached dependency diagnostics, even when now empty.
        std::set<std::string> reachable;
        std::vector<std::string> queue{name};
        while (!queue.empty()) {
            auto current = queue.back(); queue.pop_back();
            if (!reachable.insert(current).second) continue;
            auto node = p.frontend->sourceNodes.find(current);
            auto module = p.frontend->moduleResolver.getModule(current);
            if (module && module->cancelled) throw std::runtime_error("Module check was cancelled");
            if (module && module->timeout) { project.reset(); return std::string("{\"status\":\"deadline\"}"); }
            if (node != p.frontend->sourceNodes.end()) for (const auto& dependency : node->second->requireSet) queue.push_back(dependency);
            auto prelude = p.scopes.preludeOf(current); if (!prelude.empty()) queue.push_back(prelude);
        }
        std::vector<std::pair<Luau::TypeError, std::optional<size_t>>> errors;
        for (const auto& current : reachable) {
            auto module = p.frontend->moduleResolver.getModule(current);
            auto source = p.frontend->getSourceModule(current);
            if (module) for (size_t index = 0; index < module->errors.size(); ++index) {
                // Pinned Frontend inserts converter parse errors at the start
                // of module.errors in their original order. Nocheck can omit
                // them entirely; the facade also owns converter syntax facts.
                const auto& error = module->errors[index];
                std::optional<size_t> ordinal;
                if (source && index < source->parseErrors.size() && Luau::get<Luau::SyntaxError>(error)) ordinal = index;
                errors.emplace_back(error, ordinal);
            }
        }
        std::string json = "{\"status\":\"ok\",\"checkedModules\":" + std::to_string(p.checked) + ",\"diagnostics\":[";
        bool first = true;
        for (const auto& [e, ordinal] : errors) { if (!first) json += ','; first = false; json += diagnostic(e, &p.files, ordinal); }
        json += "],\"modules\":["; first = true;
        for (const auto& module : reachable) {
            if (!p.files.sources.count(module)) continue;
            if (!first) json += ','; first = false; json += quote(module);
        }
        // Upstream exposes only diagnostic text here, which user error() can imitate.
        bool ambiguousMemoryError = false;
        for (const auto& [e, ordinal] : errors) if (auto runtime = Luau::get<Luau::UserDefinedTypeFunctionError>(e))
            if (runtime->message.find("not enough memory") != std::string::npos) ambiguousMemoryError = true;
        // Diagnostic collection and the backend status are now known. A
        // failed invocation discards staging with the project; no half-view
        // is visible to subsequent public queries.
        if (!ambiguousMemoryError) p.scopes.commitSourceMetadata();
        json += "],\"scopeGenerations\":["; first = true;
        for (const auto& current : reachable) if (auto generation = p.scopes.generation(current)) {
            if (!first) json += ','; first = false; json += "{\"module\":" + quote(current) + ",\"generation\":" + std::to_string(generation) + "}";
        }
        json += "],\"scopeMetadataGenerations\":["; first = true;
        for (const auto& current : reachable) if (auto generation = p.scopes.metadataGeneration(current)) {
            if (!first) json += ','; first = false; json += "{\"module\":" + quote(current) + ",\"generation\":" + std::to_string(generation) + "}";
        }
        json += "],\"nativeRetention\":{\"installedInputs\":" + std::to_string(p.files.sources.size()) + ",\"retainedAstInputs\":" + std::to_string(p.astInputs.size())
            + ",\"snapshots\":" + std::to_string(p.scopes.snapshotCount()) + ",\"flowOwners\":" + std::to_string(p.scopes.flowOwnerCount())
            + ",\"leases\":" + std::to_string(p.scopes.leaseCount()) + "},\"work\":{\"changedInputs\":0,\"decodedInputs\":0,\"parsedModules\":"
            + std::to_string(p.frontend->stats.files - parsed) + "},\"nativeCheckingMs\":" + std::to_string(checkingMs) + ",\"nativeEncodingMs\":" + std::to_string(emscripten_get_now() - encodingStart) + "}";
        if (ambiguousMemoryError) { json.replace(json.find("\"ok\""), 4, "\"error\""); project.reset(); }
        return json;
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_query(const char* name, int line, int column, int maxLength) {
    return guard([&] {
        auto& p = get();
        auto module = p.frontend->moduleResolver.getModule(name);
        auto source = p.frontend->getSourceModule(name);
        if (!module || !source || p.frontend->isDirty(name)) throw std::runtime_error("Module requires check before query");
        auto ty = selectedType(*module, *source, Luau::Position(line, column));
        if (!ty) return std::string("{\"status\":\"ok\",\"type\":null}");
        Luau::ToStringOptions options; options.maxTypeLength = maxLength; options.maxTableLength = 0;
        auto detailed = Luau::toStringDetailed(*ty, options);
        auto text = std::move(detailed.name);
        bool truncated = detailed.truncated || text.size() > size_t(maxLength);
        if (text.size() > size_t(maxLength)) {
            size_t boundary = maxLength;
            // A byte limit must not split a UTF-8 code point in the JSON result.
            while (boundary > 0 && (static_cast<unsigned char>(text[boundary]) & 0xc0) == 0x80) --boundary;
            text.resize(boundary);
        }
        return "{\"status\":\"ok\",\"type\":" + quote(text) + ",\"truncated\":" + (truncated ? "true}" : "false}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_query_source(const char* name, int line, int column, int maxFields) {
    return guard([&] {
        auto& p = get();
        auto module = p.frontend->moduleResolver.getModule(name);
        auto source = p.frontend->getSourceModule(name);
        if (!module || !source || p.frontend->isDirty(name)) throw std::runtime_error("Module requires check before query");
        if (maxFields < 1 || maxFields > 128) throw std::runtime_error("Invalid source query bound");
        auto type = selectedType(*module, *source, Luau::Position(line, column));
        if (!type) return std::string("{\"status\":\"ok\",\"origin\":null,\"effective\":null,\"supported\":true,\"truncated\":false}");
        const auto selected = Luau::follow(*type);
        // A union/overload has multiple possible source owners. This bounded
        // scalar seam never picks its first arm and labels it complete.
        if (Luau::get<Luau::UnionType>(selected) || Luau::get<Luau::IntersectionType>(selected))
            return std::string("{\"status\":\"ok\",\"origin\":null,\"effective\":null,\"supported\":false,\"truncated\":false}");
        const auto* function = Luau::get<Luau::FunctionType>(selected);
        if (!function || !function->definition || !function->definition->definitionModuleName)
            return std::string("{\"status\":\"ok\",\"origin\":null,\"effective\":null,\"supported\":true,\"truncated\":false}");
        auto facts = p.scopes.sourceFacts(*p.frontend, name, *type);
        if (!facts) return std::string("{\"status\":\"ok\",\"origin\":null,\"effective\":null,\"supported\":false,\"truncated\":false}");
        return "{\"status\":\"ok\",\"supported\":true,\"origin\":" + sourceFacts(facts->origin, size_t(maxFields))
            + ",\"effective\":" + sourceFacts(facts->effective, size_t(maxFields))
            + ",\"truncated\":" + (std::max(facts->origin.fields.size(), facts->effective.fields.size()) > size_t(maxFields) ? "true}" : "false}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_query_scope_source(const char* name, const char* space, const char* key, int maxFields) {
    return guard([&] {
        auto& p = get();
        if (!p.frontend->moduleResolver.getModule(name) || p.frontend->isDirty(name)) throw std::runtime_error("Module requires check before query");
        const std::string selectedSpace(space), selectedName(key);
        if ((selectedSpace != "alias" && selectedSpace != "value") || selectedName.empty() || selectedName.size() > 1024
            || maxFields < 1 || maxFields > 128) throw std::runtime_error("Invalid scope source query bound");
        auto facts = p.scopes.scopeSourceFacts(*p.frontend, name, selectedSpace, selectedName);
        if (!facts) return std::string("{\"status\":\"ok\",\"origin\":null,\"effective\":null,\"supported\":false,\"truncated\":false}");
        return "{\"status\":\"ok\",\"supported\":true,\"origin\":" + sourceFacts(facts->origin, size_t(maxFields))
            + ",\"effective\":" + sourceFacts(facts->effective, size_t(maxFields))
            + ",\"truncated\":" + (std::max(facts->origin.fields.size(), facts->effective.fields.size()) > size_t(maxFields) ? "true}" : "false}");
    });
}
EMSCRIPTEN_KEEPALIVE void analysis_dispose() { project.reset(); result.clear(); }
EMSCRIPTEN_KEEPALIVE unsigned analysis_memory_bytes() { return emscripten_get_heap_size(); }
EMSCRIPTEN_KEEPALIVE void* analysis_allocate(unsigned bytes) { return std::malloc(bytes); }
EMSCRIPTEN_KEEPALIVE void analysis_free(void* buffer) { std::free(buffer); }
}
