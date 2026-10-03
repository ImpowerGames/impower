// Minimal production ABI for Luau 7d5f73364fdbbaa984fa545071630eba73cfea98 (MIT).
#include "Luau/Frontend.h"
#include "Luau/BuiltinDefinitions.h"
#include "Luau/AstQuery.h"
#include "Luau/ToString.h"
#include "Luau/Parser.h"
#include <emscripten/emscripten.h>
#include <emscripten/heap.h>
#include <algorithm>
#include <memory>
#include <map>
#include <sstream>
#include <set>

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
std::string diagnostic(const Luau::TypeError& e) {
    return "{\"module\":" + quote(e.moduleName) + ",\"code\":" + std::to_string(e.code()) +
        ",\"message\":" + quote(Luau::toString(e)) + ",\"range\":" + location(e.location) + "}";
}
struct DefinitionFailure : std::runtime_error {
    std::string diagnostics;
    DefinitionFailure(const std::string& name, std::string diagnostics)
        : std::runtime_error("Invalid definition file: " + name), diagnostics(std::move(diagnostics)) {}
};
struct Files : Luau::FileResolver {
    std::map<std::string, std::string> sources;
    std::optional<Luau::SourceCode> readSource(const Luau::ModuleName& name) override {
        auto i = sources.find(name);
        return i == sources.end() ? std::nullopt : std::optional<Luau::SourceCode>{{i->second, Luau::SourceCode::Module}};
    }
    std::optional<Luau::ModuleInfo> resolveModule(const Luau::ModuleInfo* context, Luau::AstExpr* expr, const Luau::TypeCheckLimits&) override {
        if (auto s = expr->as<Luau::AstExprConstantString>()) {
            std::string name(s->value.data, s->value.size);
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
    const Luau::Config& getConfig(const Luau::ModuleName&, const Luau::TypeCheckLimits&) const override { return value; }
};
struct Project {
    Files files;
    Config config;
    std::map<std::string, std::string> definitions;
    std::unique_ptr<Luau::Frontend> frontend;
    size_t checked = 0;
    Project(int mode) { config.value.mode = Luau::Mode(mode); }
    void reset() {
        Luau::FrontendOptions options;
        options.retainFullTypeGraphs = true;
        options.customModuleCheck = [this](const Luau::SourceModule&, const Luau::Module&) { ++checked; };
        frontend = std::make_unique<Luau::Frontend>(Luau::SolverMode::New, &files, &config, options);
        Luau::unfreeze(frontend->globals.globalTypes);
        Luau::registerBuiltinGlobals(*frontend, frontend->globals);
        for (const auto& [name, source] : definitions) {
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
        bool changed = remove ? old != p.files.sources.end() : old == p.files.sources.end() || old->second != source;
        if (changed) {
            p.frontend->markDirty(name);
            if (remove) p.files.sources.erase(name); else p.files.sources[name] = source;
        }
        return std::string("{\"status\":\"ok\",\"changed\":") + (changed ? "true}" : "false}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_definition(const char* name, const char* source, int remove) {
    return guard([&] {
        auto& p = get();
        if (remove) p.definitions.erase(name); else p.definitions[name] = source;
        p.reset(); return std::string("{\"status\":\"ok\"}");
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_check(const char* name, double seconds) {
    return guard([&] {
        auto& p = get();
        if (!p.files.sources.count(name)) throw std::runtime_error("Missing root module");
        auto options = p.frontend->options;
        options.moduleTimeLimitSec = seconds;
        p.checked = 0;
        double start = emscripten_get_now();
        auto r = p.frontend->check(name, options);
        double checkingMs = emscripten_get_now() - start;
        double encodingStart = emscripten_get_now();
        if (!r.timeoutHits.empty()) { project.reset(); return std::string("{\"status\":\"deadline\"}"); }
        std::string json = "{\"status\":\"ok\",\"checkedModules\":" + std::to_string(p.checked) + ",\"diagnostics\":[";
        bool first = true;
        for (const auto& e : r.errors) {
            if (!first) json += ','; first = false;
            json += diagnostic(e);
        }
        // Replacement coverage includes cached dependency diagnostics, even when now empty.
        std::set<std::string> reachable;
        std::vector<std::string> queue{name};
        while (!queue.empty()) {
            auto current = queue.back(); queue.pop_back();
            if (!reachable.insert(current).second) continue;
            auto node = p.frontend->sourceNodes.find(current);
            if (node != p.frontend->sourceNodes.end()) for (const auto& dependency : node->second->requireSet) queue.push_back(dependency);
        }
        json += "],\"modules\":["; first = true;
        for (const auto& module : reachable) {
            if (!p.files.sources.count(module)) continue;
            if (!first) json += ','; first = false; json += quote(module);
        }
        // Heap allocator failures can be reported by the VM as a runtime diagnostic.
        bool heapLimit = false;
        for (const auto& e : r.errors) if (auto runtime = Luau::get<Luau::UserDefinedTypeFunctionError>(e))
            if (runtime->message.find("not enough memory") != std::string::npos) heapLimit = true;
        json += "],\"nativeCheckingMs\":" + std::to_string(checkingMs) + ",\"nativeEncodingMs\":" + std::to_string(emscripten_get_now() - encodingStart) + "}";
        if (heapLimit) { json.replace(json.find("\"ok\""), 4, "\"memory-limit\""); project.reset(); }
        return json;
    });
}
EMSCRIPTEN_KEEPALIVE const char* analysis_query(const char* name, int line, int column, int maxLength) {
    return guard([&] {
        auto& p = get();
        auto module = p.frontend->moduleResolver.getModule(name);
        auto source = p.frontend->getSourceModule(name);
        if (!module || !source || p.frontend->isDirty(name)) throw std::runtime_error("Module requires check before query");
        auto ty = Luau::findTypeAtPosition(*module, *source, Luau::Position(line, column));
        if (!ty) if (auto binding = Luau::findBindingAtPosition(*module, *source, Luau::Position(line, column))) ty = binding->typeId;
        if (!ty) return std::string("{\"status\":\"ok\",\"type\":null}");
        Luau::ToStringOptions options; options.maxTypeLength = maxLength; options.maxTableLength = maxLength;
        auto text = Luau::toString(*ty, options);
        bool truncated = text.size() > size_t(maxLength);
        if (truncated) text.resize(maxLength);
        return "{\"status\":\"ok\",\"type\":" + quote(text) + ",\"truncated\":" + (truncated ? "true}" : "false}");
    });
}
EMSCRIPTEN_KEEPALIVE void analysis_dispose() { project.reset(); result.clear(); }
EMSCRIPTEN_KEEPALIVE unsigned analysis_memory_bytes() { return emscripten_get_heap_size(); }
}
