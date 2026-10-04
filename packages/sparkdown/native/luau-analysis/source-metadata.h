#pragma once

#include "Luau/Type.h"
#include <functional>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

namespace SparkdownAnalysis {

// Native graph cells remain immutable. These copied facts describe one source
// revision in UTF16 coordinates; they contain no allocator/type/scope handles.
struct SourceLocationFact {
    std::string module;
    Luau::Location range;
    size_t generation = 0;
};
struct SourceFieldFact {
    std::string kind;
    std::string name;
    size_t index = 0;
    SourceLocationFact source;
};
struct SourceMetadataFacts {
    std::vector<SourceFieldFact> fields;
    bool complete = true;
    bool ambiguous = false;
};
struct SourceMetadataCorrespondence {
    SourceMetadataFacts origin;
    SourceMetadataFacts effective;
};
using SourceMetadataCorrespondences = std::map<std::string, SourceMetadataCorrespondence>;
// Scalar identity of a recorded origin, including its ORIGINAL revision. The
// domain separates namespace entries from graph-cell roles; alias A and B do
// not collapse merely because their types share one builtin cell.
inline std::string sourceFactsAnchor(const std::string& domain, const SourceMetadataFacts& facts) {
    std::ostringstream out;
    out << "source:";
    auto text = [&](const std::string& value) { out << value.size() << ':' << value; };
    text(domain); out << ':' << facts.complete << ':' << facts.ambiguous << ':' << facts.fields.size();
    for (const auto& field : facts.fields) {
        text(field.kind); text(field.name); out << ':' << field.index << ':'; text(field.source.module);
        const auto& range = field.source.range;
        out << ':' << field.source.generation << ':' << range.begin.line << ':' << range.begin.column
            << ':' << range.end.line << ':' << range.end.column;
    }
    return out.str();
}
inline bool equalSourceFacts(const SourceMetadataFacts& a, const SourceMetadataFacts& b) {
    if (a.complete != b.complete || a.ambiguous != b.ambiguous || a.fields.size() != b.fields.size()) return false;
    for (size_t i = 0; i < a.fields.size(); ++i) {
        const auto& x = a.fields[i]; const auto& y = b.fields[i];
        if (x.kind != y.kind || x.name != y.name || x.index != y.index || x.source.module != y.source.module
            || x.source.range != y.source.range || x.source.generation != y.source.generation) return false;
    }
    return true;
}
inline bool sameSourceRoles(const SourceMetadataFacts& a, const SourceMetadataFacts& b) {
    if (!a.complete || !b.complete || a.ambiguous || b.ambiguous || a.fields.size() != b.fields.size()) return false;
    for (size_t i = 0; i < a.fields.size(); ++i) {
        const auto& x = a.fields[i]; const auto& y = b.fields[i];
        if (x.kind != y.kind || x.name != y.name || x.index != y.index || x.source.module != y.source.module) return false;
    }
    return true;
}
inline void mergeSourceFacts(std::map<std::string, SourceMetadataFacts>& origins, const std::string& anchor, const SourceMetadataFacts& facts) {
    auto [prior, inserted] = origins.emplace(anchor, facts);
    if (!inserted && !equalSourceFacts(prior->second, facts)) {
        // Conflict is sticky for this checked origin set. No later merge or
        // own-map shortcut can restore a first-wins arbitrary source revision.
        prior->second.fields.clear(); prior->second.complete = false; prior->second.ambiguous = true;
    }
}
// Projection happens against the originating input while it is still current.
// Imported/copied metadata must reuse its recorded origin instead of projecting
// old byte columns against a later source revision.
using SourceLocationProjector = std::function<std::optional<SourceLocationFact>(const std::string&, const Luau::Location&)>;

// Exact native metadata anchor for copies made by Instantiation/Substitution.
// This is scoped to the checked borrower's retained origins, never searched
// across projects or inferred from a function's display name.
inline std::string functionSourceAnchor(Luau::TypeId type) {
    const auto* function = Luau::get<Luau::FunctionType>(Luau::follow(type));
    if (!function || !function->definition || !function->definition->definitionModuleName) return {};
    std::ostringstream out;
    auto text = [&](const std::string& value) { out << value.size() << ':' << value; };
    auto range = [&](const Luau::Location& value) {
        out << ':' << value.begin.line << ':' << value.begin.column << ':' << value.end.line << ':' << value.end.column;
    };
    const auto& definition = *function->definition;
    text(*definition.definitionModuleName); range(definition.definitionLocation); range(definition.originalNameLocation);
    out << ':' << bool(definition.varargLocation);
    if (definition.varargLocation) range(*definition.varargLocation);
    out << ':' << function->argNames.size();
    for (const auto& argument : function->argNames) {
        out << ':' << bool(argument);
        if (argument) { text(argument->name); range(argument->location); }
    }
    return out.str();
}

inline SourceMetadataFacts functionSourceFacts(Luau::TypeId type, const SourceLocationProjector& project) {
    SourceMetadataFacts result;
    const auto* function = Luau::get<Luau::FunctionType>(Luau::follow(type));
    if (!function || !function->definition || !function->definition->definitionModuleName) return result;
    const auto& definition = *function->definition;
    const auto& module = *definition.definitionModuleName;
    auto field = [&](const char* kind, const std::string& name, size_t index, const Luau::Location& range) {
        if (auto source = project(module, range)) result.fields.push_back({kind, name, index, std::move(*source)});
        else result.complete = false;
    };
    field("definition", "", 0, definition.definitionLocation);
    // Anonymous/synthetic names have no authored span. Do not present their
    // default zero-width Location as an identifier at the start of the file.
    if (definition.originalNameLocation.begin < definition.originalNameLocation.end)
        field("name", "", 0, definition.originalNameLocation);
    if (definition.varargLocation) field("vararg", "", 0, *definition.varargLocation);
    for (size_t i = 0; i < function->argNames.size(); ++i)
        if (const auto& argument = function->argNames[i]; argument && argument->location.begin < argument->location.end)
            field("parameter", argument->name, i, argument->location);
    return result;
}

} // namespace SparkdownAnalysis
