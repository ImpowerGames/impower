#pragma once
#include "Luau/Module.h"
#include <memory>
#include <string_view>

namespace SparkdownAnalysis {
// Schema-1/2 decoder. Unsupported constructors and unavailable authoritative
// metadata fail explicitly; schema 2 is the public production input variant.
std::shared_ptr<Luau::SourceModule> decodeAst(std::string_view encoded, const Luau::ModuleName& name);
// Installs only native-generated, unspellable synthetic identities. Their
// types are existing Sparkdown compatibility behavior, not typed constructors.
void prepareSyntheticBindings(const Luau::SourceModule& source, const Luau::ScopePtr& scope, const Luau::BuiltinTypes& types);
bool isSyntheticBindingName(std::string_view name);
}
