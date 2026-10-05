#include "incremental-scopes.h"
#include "ast-input.h"
#include "Luau/Clone.h"
#include "Luau/TypePack.h"
#include <algorithm>
#include <cstring>
#include <map>
#include <set>
#include <stdexcept>

namespace SparkdownAnalysis {
namespace {
using TableSources = std::map<Luau::TypeId, SourceMetadataFacts>;
using EntrySources = std::map<std::string, SourceMetadataFacts>;
bool sameName(Luau::AstName a, Luau::AstName b) {
    return (!a.value && !b.value) || (a.value && b.value && std::string(a.value) == b.value);
}
// This is an intentionally finite executable inventory, not an AST printer.
// Source positions stay strict: retaining executable ASTs cannot relocate VM
// errors through the ordinary type-metadata view. Unknown/recovery nodes fail.
struct ExecutableAstPair {
    std::map<const Luau::AstNode*, const Luau::AstNode*> nodes, reverseNodes;
    std::map<const Luau::AstLocal*, const Luau::AstLocal*> locals, reverseLocals;
    size_t visits = 0;
    template<class T> bool list(const Luau::AstArray<T*>& a, const Luau::AstArray<T*>& b,
        const std::set<std::string>& globals, size_t depth) {
        if (a.size != b.size) return false;
        for (size_t i = 0; i < a.size; ++i) if (!node(a.data[i], b.data[i], globals, depth + 1)) return false;
        return true;
    }
    bool local(const Luau::AstLocal* a, const Luau::AstLocal* b) {
        if (++visits > 10000) return false;
        if (!a || !b) return a == b;
        if (auto prior = locals.find(a); prior != locals.end()) return prior->second == b;
        if (reverseLocals.count(b) || !sameName(a->name, b->name) || a->location != b->location
            || a->functionDepth != b->functionDepth || a->loopDepth != b->loopDepth
            || a->isConst != b->isConst || a->isExported != b->isExported || a->annotation || b->annotation) return false;
        // A shadow outside this executable has no proven binding identity.
        if (bool(a->shadow) != bool(b->shadow)) return false;
        if (a->shadow) {
            auto shadow = locals.find(a->shadow);
            if (shadow == locals.end() || shadow->second != b->shadow) return false;
        }
        locals[a] = b; reverseLocals[b] = a; return true;
    }
    bool node(const Luau::AstNode* a, const Luau::AstNode* b, const std::set<std::string>& globals, size_t depth = 0) {
        if (depth > 128 || ++visits > 10000) return false;
        if (!a || !b) return a == b;
        if (a->classIndex != b->classIndex || a->location != b->location) return false;
        if (auto prior = nodes.find(a); prior != nodes.end()) return prior->second == b;
        if (reverseNodes.count(b)) return false;
        nodes[a] = b; reverseNodes[b] = a;
        auto stat = const_cast<Luau::AstNode*>(a)->asStat();
        auto otherStat = const_cast<Luau::AstNode*>(b)->asStat();
        if (stat && (!otherStat || stat->hasSemicolon != otherStat->hasSemicolon)) return false;
        if (auto x = a->as<Luau::AstStatTypeFunction>()) {
            auto y = b->as<Luau::AstStatTypeFunction>();
            return !x->hasErrors && !y->hasErrors && x->exported == y->exported
                && sameName(x->name, y->name) && x->nameLocation == y->nameLocation
                && node(x->body, y->body, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstExprFunction>()) {
            auto y = b->as<Luau::AstExprFunction>();
            if (x->attributes.size || y->attributes.size || x->generics.size || y->generics.size
                || x->genericPacks.size || y->genericPacks.size || x->vararg || y->vararg
                || x->self || y->self || x->returnAnnotation || y->returnAnnotation
                || x->varargAnnotation || y->varargAnnotation || x->varargLocation != y->varargLocation
                || x->functionDepth != y->functionDepth || !sameName(x->debugname, y->debugname)
                || x->argLocation != y->argLocation || x->args.size != y->args.size) return false;
            for (size_t i = 0; i < x->args.size; ++i) if (!local(x->args.data[i], y->args.data[i])) return false;
            return node(x->body, y->body, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstStatBlock>()) {
            auto y = b->as<Luau::AstStatBlock>();
            return x->hasEnd && y->hasEnd && list(x->body, y->body, globals, depth);
        }
        if (auto x = a->as<Luau::AstStatReturn>()) return list(x->list, b->as<Luau::AstStatReturn>()->list, globals, depth);
        if (auto x = a->as<Luau::AstStatExpr>()) return node(x->expr, b->as<Luau::AstStatExpr>()->expr, globals, depth + 1);
        if (auto x = a->as<Luau::AstStatLocal>()) {
            auto y = b->as<Luau::AstStatLocal>();
            if (x->isConst != y->isConst || x->isExported != y->isExported || x->keywordLocation != y->keywordLocation
                || x->equalsSignLocation != y->equalsSignLocation || x->vars.size != y->vars.size
                || !list(x->values, y->values, globals, depth)) return false;
            // Initializers see the previous binding, before these locals exist.
            for (size_t i = 0; i < x->vars.size; ++i) if (!local(x->vars.data[i], y->vars.data[i])) return false;
            return true;
        }
        if (auto x = a->as<Luau::AstStatLocalFunction>()) {
            auto y = b->as<Luau::AstStatLocalFunction>();
            return x->isConst == y->isConst && x->constKeywordBegin == y->constKeywordBegin
                && local(x->name, y->name) && node(x->func, y->func, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstStatAssign>()) {
            auto y = b->as<Luau::AstStatAssign>();
            return list(x->vars, y->vars, globals, depth) && list(x->values, y->values, globals, depth);
        }
        if (auto x = a->as<Luau::AstStatCompoundAssign>()) {
            auto y = b->as<Luau::AstStatCompoundAssign>();
            return x->op == y->op && node(x->var, y->var, globals, depth + 1) && node(x->value, y->value, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstStatIf>()) {
            auto y = b->as<Luau::AstStatIf>();
            return !x->conditionLocal && !y->conditionLocal && x->conditionIsConst == y->conditionIsConst
                && x->conditionKeywordLocation == y->conditionKeywordLocation && x->conditionEqualsLocation == y->conditionEqualsLocation
                && x->thenLocation == y->thenLocation && x->elseLocation == y->elseLocation
                && node(x->condition, y->condition, globals, depth + 1) && node(x->thenbody, y->thenbody, globals, depth + 1)
                && node(x->elsebody, y->elsebody, globals, depth + 1);
        }
        if (a->as<Luau::AstExprConstantNil>()) return true;
        if (auto x = a->as<Luau::AstExprConstantBool>()) return x->value == b->as<Luau::AstExprConstantBool>()->value;
        if (auto x = a->as<Luau::AstExprConstantNumber>()) {
            auto y = b->as<Luau::AstExprConstantNumber>();
            // Bit equality retains signed zero; malformed numbers are excluded.
            return x->parseResult == Luau::ConstantNumberParseResult::Ok && y->parseResult == x->parseResult
                && std::memcmp(&x->value, &y->value, sizeof(x->value)) == 0;
        }
        if (auto x = a->as<Luau::AstExprConstantInteger>()) {
            auto y = b->as<Luau::AstExprConstantInteger>();
            return x->parseResult == Luau::ConstantNumberParseResult::Ok && y->parseResult == x->parseResult && x->value == y->value;
        }
        if (auto x = a->as<Luau::AstExprConstantString>()) {
            auto y = b->as<Luau::AstExprConstantString>();
            return x->quoteStyle == y->quoteStyle && x->value.size == y->value.size
                && (!x->value.size || std::memcmp(x->value.data, y->value.data, x->value.size) == 0);
        }
        if (auto x = a->as<Luau::AstExprLocal>()) {
            auto y = b->as<Luau::AstExprLocal>(); auto found = locals.find(x->local);
            return x->upvalue == y->upvalue && found != locals.end() && found->second == y->local;
        }
        if (auto x = a->as<Luau::AstExprGlobal>()) {
            auto y = b->as<Luau::AstExprGlobal>();
            // Only actual captured names are proven here. VM library globals
            // and ordinary/foreign bindings need a separate dependency proof.
            return sameName(x->name, y->name) && x->name.value && globals.count(x->name.value);
        }
        if (auto x = a->as<Luau::AstExprGroup>()) return node(x->expr, b->as<Luau::AstExprGroup>()->expr, globals, depth + 1);
        if (auto x = a->as<Luau::AstExprCall>()) {
            auto y = b->as<Luau::AstExprCall>();
            return !x->typeArguments.size && !y->typeArguments.size && x->self == y->self && x->argLocation == y->argLocation
                && node(x->func, y->func, globals, depth + 1) && list(x->args, y->args, globals, depth);
        }
        if (auto x = a->as<Luau::AstExprIndexName>()) {
            auto y = b->as<Luau::AstExprIndexName>();
            return sameName(x->index, y->index) && x->indexLocation == y->indexLocation && x->opPosition == y->opPosition
                && x->op == y->op && node(x->expr, y->expr, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstExprIndexExpr>()) {
            auto y = b->as<Luau::AstExprIndexExpr>();
            return node(x->expr, y->expr, globals, depth + 1) && node(x->index, y->index, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstExprUnary>()) {
            auto y = b->as<Luau::AstExprUnary>(); return x->op == y->op && node(x->expr, y->expr, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstExprBinary>()) {
            auto y = b->as<Luau::AstExprBinary>();
            return x->op == y->op && node(x->left, y->left, globals, depth + 1) && node(x->right, y->right, globals, depth + 1);
        }
        if (auto x = a->as<Luau::AstExprTable>()) {
            auto y = b->as<Luau::AstExprTable>(); if (x->items.size != y->items.size) return false;
            for (size_t i = 0; i < x->items.size; ++i) {
                const auto& left = x->items.data[i]; const auto& right = y->items.data[i];
                if (left.kind != right.kind || !node(left.key, right.key, globals, depth + 1)
                    || !node(left.value, right.value, globals, depth + 1)) return false;
            }
            return true;
        }
        if (auto x = a->as<Luau::AstExprIfElse>()) {
            auto y = b->as<Luau::AstExprIfElse>();
            return x->hasThen == y->hasThen && x->hasElse == y->hasElse
                && node(x->condition, y->condition, globals, depth + 1) && node(x->trueExpr, y->trueExpr, globals, depth + 1)
                && node(x->falseExpr, y->falseExpr, globals, depth + 1);
        }
        return false;
    }
};
// Every entry below is selected from this checked root, not recovered by name
// from a printed/cloned graph. These borrowed references live only for compare.
struct ExecutableOrigins {
    const Luau::Module* owner = nullptr;
    struct Declaration { Luau::TypeId carrier; const Luau::Binding* callable; };
    std::map<const Luau::AstStatTypeFunction*, Declaration> declarations;
    struct Alias { const Luau::AstStatTypeAlias* syntax; const Luau::TypeFun* native; };
    std::map<std::string, Alias> aliases;
    std::set<const Luau::TypeFun*> capturedAliases;
};
// Compare graph identity/sharing and every supported field, never printed
// types or subtyping. Only proven executable declaration carriers are admitted.
struct ExportGraph {
    const std::map<std::string, SourceMetadataFacts>& oldSources;
    const std::map<std::string, SourceMetadataFacts>& newSources;
    const TableSources& oldTables;
    const TableSources& newTables;
    const EntrySources& oldEntries;
    const EntrySources& newEntries;
    SourceMetadataCorrespondences metadata;
    std::map<std::string, std::string> reverseMetadata;
    std::map<Luau::TypeId, Luau::TypeId> types, reverseTypes;
    std::map<Luau::TypePackId, Luau::TypePackId> packs, reversePacks;
    std::map<Luau::Scope*, Luau::Scope*> scopes, reverseScopes;
    std::set<Luau::TypeId> genericBinders;
    std::set<Luau::TypePackId> packBinders;
    const ExecutableOrigins* oldExecutables = nullptr;
    const ExecutableOrigins* newExecutables = nullptr;
    ExecutableAstPair executableAst;
    size_t visits = 0;
    ExportGraph(const std::map<std::string, SourceMetadataFacts>& oldSources,
        const std::map<std::string, SourceMetadataFacts>& newSources, const TableSources& oldTables,
        const TableSources& newTables, const EntrySources& oldEntries, const EntrySources& newEntries)
        : oldSources(oldSources), newSources(newSources), oldTables(oldTables), newTables(newTables),
          oldEntries(oldEntries), newEntries(newEntries) {}
    bool sourceCorrespondence(const std::string& domain, const SourceMetadataFacts& old, const SourceMetadataFacts& next) {
        if (!sameSourceRoles(old, next) || old.fields.empty()) return false;
        const auto oldAnchor = sourceFactsAnchor(domain, old), newAnchor = sourceFactsAnchor(domain, next);
        if (auto prior = metadata.find(oldAnchor); prior != metadata.end())
            return equalSourceFacts(prior->second.origin, old) && equalSourceFacts(prior->second.effective, next);
        auto reverse = reverseMetadata.find(newAnchor);
        if (reverse != reverseMetadata.end() && reverse->second != oldAnchor) return false;
        metadata.emplace(oldAnchor, SourceMetadataCorrespondence{old, next}); reverseMetadata[newAnchor] = oldAnchor;
        return true;
    }
    bool entryMetadata(const std::string& entry, bool sameLocations) {
        auto old = oldEntries.find(entry), next = newEntries.find(entry);
        if (old == oldEntries.end() && next == newEntries.end()) return sameLocations;
        if (old == oldEntries.end() || next == newEntries.end()) return false;
        // No view is needed for strictly equal native locations with two
        // unsupported records. They remain unsupported to the observer; an
        // incomplete record never authorizes moving a declaration.
        if (old->second.ambiguous || next->second.ambiguous) return false;
        if (!old->second.complete || !next->second.complete)
            return sameLocations && !old->second.complete && !next->second.complete;
        return sourceCorrespondence("entry:" + entry, old->second, next->second);
    }
    bool tableMetadata(Luau::TypeId a, Luau::TypeId b) {
        const auto* x = Luau::get<Luau::TableType>(a); const auto* y = Luau::get<Luau::TableType>(b);
        if (!x || !y || x->definitionModuleName != y->definitionModuleName || x->props.size() != y->props.size()) return false;
        bool sameLocations = x->definitionLocation == y->definitionLocation;
        auto right = y->props.begin();
        for (const auto& [name, property] : x->props) {
            if (name != right->first || bool(property.location) != bool(right->second.location)
                || bool(property.typeLocation) != bool(right->second.typeLocation)) return false;
            sameLocations = sameLocations && property.location == right->second.location && property.typeLocation == right->second.typeLocation;
            ++right;
        }
        // Instantiated/generic role relocation is a separate acceptance gate.
        if (!sameLocations && (!x->instantiatedTypeParams.empty() || !y->instantiatedTypeParams.empty()
            || !x->instantiatedTypePackParams.empty() || !y->instantiatedTypePackParams.empty())) return false;
        auto old = oldTables.find(a), next = newTables.find(b);
        if (old == oldTables.end() && next == newTables.end()) return sameLocations;
        if (old == oldTables.end() || next == newTables.end()) return false;
        if (old->second.ambiguous || next->second.ambiguous) return false;
        if (!old->second.complete || !next->second.complete)
            return sameLocations && !old->second.complete && !next->second.complete;
        // These complete records were validated against the exact creation
        // AST and propagated through CloneState. Names/coordinates alone are
        // never used to recover a missing property origin.
        return sourceCorrespondence("table", old->second, next->second);
    }
    bool functionMetadata(Luau::TypeId a, Luau::TypeId b) {
        const auto* x = Luau::get<Luau::FunctionType>(a); const auto* y = Luau::get<Luau::FunctionType>(b);
        if (!x || !y || bool(x->definition) != bool(y->definition) || x->argNames.size() != y->argNames.size()) return false;
        bool sameLocations = true;
        if (x->definition) {
            const auto& left = *x->definition; const auto& right = *y->definition;
            if (left.definitionModuleName != right.definitionModuleName || bool(left.varargLocation) != bool(right.varargLocation)) return false;
            sameLocations = left.definitionLocation == right.definitionLocation && left.originalNameLocation == right.originalNameLocation
                && left.varargLocation == right.varargLocation;
        }
        for (size_t i = 0; i < x->argNames.size(); ++i) {
            const auto& left = x->argNames[i]; const auto& right = y->argNames[i];
            if (bool(left) != bool(right) || (left && left->name != right->name)) return false;
            if (left && left->location != right->location) sameLocations = false;
        }
        // The first relocation policy covers monomorphic authored callables.
        // Generic source-role handling remains conservative until exercised.
        if (!sameLocations && (!x->generics.empty() || !y->generics.empty() || !x->genericPacks.empty() || !y->genericPacks.empty())) return false;
        const auto oldAnchor = functionSourceAnchor(a), newAnchor = functionSourceAnchor(b);
        auto old = oldSources.find(oldAnchor), next = newSources.find(newAnchor);
        // Identical builtin/inherited cells can have no authored input facts.
        // They require no view, but cannot authorize a location change.
        if (old == oldSources.end() && next == newSources.end()) return sameLocations;
        if (old == oldSources.end() || next == newSources.end() || !sameSourceRoles(old->second, next->second)) return false;
        if (auto prior = metadata.find(oldAnchor); prior != metadata.end())
            return equalSourceFacts(prior->second.origin, old->second) && equalSourceFacts(prior->second.effective, next->second);
        auto reverse = reverseMetadata.find(newAnchor);
        if (reverse != reverseMetadata.end() && reverse->second != oldAnchor) return false;
        metadata[oldAnchor] = {old->second, next->second}; reverseMetadata[newAnchor] = oldAnchor; return true;
    }
    bool bindScope(Luau::Scope* a, Luau::Scope* b) {
        if (a == b) return true;
        if (!a || !b) return false;
        if (auto prior = scopes.find(a); prior != scopes.end()) return prior->second == b;
        if (reverseScopes.count(b)) return false;
        scopes[a] = b; reverseScopes[b] = a; return true;
    }
    bool scope(Luau::Scope* a, Luau::Scope* b) const {
        if (a == b) return true;
        auto prior = scopes.find(a); return prior != scopes.end() && prior->second == b;
    }
    bool bind(Luau::TypeId a, Luau::TypeId b) {
        auto x = Luau::get<Luau::GenericType>(Luau::follow(a)), y = Luau::get<Luau::GenericType>(Luau::follow(b));
        if (!x || !y || !bindScope(x->scope, y->scope)) return false;
        genericBinders.insert(Luau::follow(a)); return type(a, b);
    }
    bool bind(Luau::TypePackId a, Luau::TypePackId b) {
        auto x = Luau::get<Luau::GenericTypePack>(Luau::follow(a)), y = Luau::get<Luau::GenericTypePack>(Luau::follow(b));
        if (!x || !y || !bindScope(x->scope, y->scope)) return false;
        packBinders.insert(Luau::follow(a)); return pack(a, b);
    }
    bool optionalType(const std::optional<Luau::TypeId>& a, const std::optional<Luau::TypeId>& b, size_t depth) {
        return bool(a) == bool(b) && (!a || type(*a, *b, depth));
    }
    bool optionalPack(const std::optional<Luau::TypePackId>& a, const std::optional<Luau::TypePackId>& b, size_t depth) {
        return bool(a) == bool(b) && (!a || pack(*a, *b, depth));
    }
    bool typeList(const std::vector<Luau::TypeId>& a, const std::vector<Luau::TypeId>& b, size_t depth) {
        if (a.size() != b.size()) return false;
        for (size_t i = 0; i < a.size(); ++i) if (!type(a[i], b[i], depth)) return false;
        return true;
    }
    bool packList(const std::vector<Luau::TypePackId>& a, const std::vector<Luau::TypePackId>& b, size_t depth) {
        if (a.size() != b.size()) return false;
        for (size_t i = 0; i < a.size(); ++i) if (!pack(a[i], b[i], depth)) return false;
        return true;
    }
    bool property(const Luau::Property& a, const Luau::Property& b, size_t depth) {
        return a.deprecated == b.deprecated && a.deprecatedSuggestion == b.deprecatedSuggestion
            && a.tags == b.tags
            && a.documentationSymbol == b.documentationSymbol
            && optionalType(a.readTy, b.readTy, depth) && optionalType(a.writeTy, b.writeTy, depth);
    }
    bool alias(const std::string& name, const Luau::TypeFun& a, const Luau::TypeFun& b) {
        if (a.typeParams.size() != b.typeParams.size()
            || a.typePackParams.size() != b.typePackParams.size()) return false;
        if (a.definitionLocation != b.definitionLocation && (!a.typeParams.empty() || !a.typePackParams.empty())) return false;
        for (size_t i = 0; i < a.typeParams.size(); ++i) if (!bind(a.typeParams[i].ty, b.typeParams[i].ty)) return false;
        for (size_t i = 0; i < a.typePackParams.size(); ++i) if (!bind(a.typePackParams[i].tp, b.typePackParams[i].tp)) return false;
        for (size_t i = 0; i < a.typeParams.size(); ++i)
            if (!optionalType(a.typeParams[i].defaultValue, b.typeParams[i].defaultValue, 1)) return false;
        for (size_t i = 0; i < a.typePackParams.size(); ++i)
            if (!optionalPack(a.typePackParams[i].defaultValue, b.typePackParams[i].defaultValue, 1)) return false;
        return type(a.type, b.type) && entryMetadata("alias:" + name, a.definitionLocation == b.definitionLocation);
    }
    bool capturedAlias(const std::string& name, const Luau::TypeFun* a, const Luau::TypeFun* b, size_t depth) {
        if (!oldExecutables || !newExecutables || !a || !b) return false;
        if (!oldExecutables->capturedAliases.count(a) || !newExecutables->capturedAliases.count(b)) return false;
        auto left = oldExecutables->aliases.find(name), right = newExecutables->aliases.find(name);
        if (left == oldExecutables->aliases.end() || right == newExecutables->aliases.end()) return false;
        const auto* x = left->second.syntax; const auto* y = right->second.syntax;
        const auto* xt = x->type->as<Luau::AstTypeReference>(); const auto* yt = y->type->as<Luau::AstTypeReference>();
        // Capture copies must be the actual selected native declaration. A
        // typeof/foreign/derived input has no origin proof in this first slice.
        if (a->definitionLocation != left->second.native->definitionLocation
            || b->definitionLocation != right->second.native->definitionLocation
            || Luau::follow(a->type) != Luau::follow(left->second.native->type)
            || Luau::follow(b->type) != Luau::follow(right->second.native->type)
            || !a->typeParams.empty() || !b->typeParams.empty() || !a->typePackParams.empty() || !b->typePackParams.empty()
            || a->definitionLocation != b->definitionLocation || x->location != y->location
            || x->nameLocation != y->nameLocation || x->exported != y->exported || x->hasSemicolon != y->hasSemicolon
            || !sameName(x->name, y->name) || !xt || !yt || xt->location != yt->location
            || xt->nameLocation != yt->nameLocation || !sameName(xt->name, yt->name)) return false;
        return type(a->type, b->type, depth + 1);
    }
    bool executableAlias(const std::string& name) const {
        if (!oldExecutables || !newExecutables) return !oldExecutables && !newExecutables;
        auto left = oldExecutables->aliases.find(name), right = newExecutables->aliases.find(name);
        if (left == oldExecutables->aliases.end() || right == newExecutables->aliases.end())
            return left == oldExecutables->aliases.end() && right == newExecutables->aliases.end();
        const auto* x = left->second.syntax; const auto* y = right->second.syntax;
        const auto* xt = x->type->as<Luau::AstTypeReference>(); const auto* yt = y->type->as<Luau::AstTypeReference>();
        return x->location == y->location && x->nameLocation == y->nameLocation && x->exported == y->exported
            && x->hasSemicolon == y->hasSemicolon && sameName(x->name, y->name)
            && xt && yt && xt->location == yt->location && xt->nameLocation == yt->nameLocation && sameName(xt->name, yt->name);
    }
    bool executable(Luau::TypeId a, Luau::TypeId b, const Luau::TypeFunctionInstanceType& x,
        const Luau::TypeFunctionInstanceType& y, size_t depth) {
        if (!oldExecutables || !newExecutables || depth > 128 || ++visits > 10000) return false;
        auto left = oldExecutables->declarations.find(x.userFuncData.definition);
        auto right = newExecutables->declarations.find(y.userFuncData.definition);
        if (left == oldExecutables->declarations.end() || right == newExecutables->declarations.end()
            || left->second.carrier != a || right->second.carrier != b
            || x.userFuncData.owner.lock().get() != oldExecutables->owner
            || y.userFuncData.owner.lock().get() != newExecutables->owner
            || x.function != y.function || x.state != Luau::TypeFunctionInstanceState::Unsolved
            || y.state != x.state || !x.userFuncName || !y.userFuncName || !sameName(*x.userFuncName, *y.userFuncName)
            || a->persistent != b->persistent || a->documentationSymbol != b->documentationSymbol
            || x.userFuncData.environmentFunction.size() != y.userFuncData.environmentFunction.size()
            || x.userFuncData.environmentAlias.size() != y.userFuncData.environmentAlias.size()) return false;
        std::set<std::string> globals;
        for (const auto& [name, captured] : x.userFuncData.environmentFunction) {
            if (++visits > 10000) return false;
            auto other = y.userFuncData.environmentFunction.find(name);
            if (!other || captured.second != other->second) return false;
            auto function = oldExecutables->declarations.find(captured.first);
            auto otherFunction = newExecutables->declarations.find(other->first);
            if (function == oldExecutables->declarations.end() || otherFunction == newExecutables->declarations.end()) return false;
            auto prior = types.find(function->second.carrier);
            // A recursive edge revisits the SAME declaration graph pair. The
            // first visit still checks its AST, callable and whole environment.
            if (prior != types.end()) {
                if (prior->second != otherFunction->second.carrier) return false;
            } else if (!type(function->second.carrier, otherFunction->second.carrier, depth + 1)) return false;
            globals.insert(name);
        }
        for (const auto& [name, captured] : x.userFuncData.environmentAlias) {
            if (++visits > 10000) return false;
            auto other = y.userFuncData.environmentAlias.find(name);
            if (!other || captured.second != other->second || !capturedAlias(name, captured.first, other->first, depth + 1)) return false;
            globals.insert(name);
        }
        const auto& callable = *left->second.callable; const auto& otherCallable = *right->second.callable;
        return callable.location == otherCallable.location && callable.deprecated == otherCallable.deprecated
            && callable.deprecatedSuggestion == otherCallable.deprecatedSuggestion && callable.documentationSymbol == otherCallable.documentationSymbol
            && executableAst.node(x.userFuncData.definition, y.userFuncData.definition, globals)
            && typeList(x.typeArguments, y.typeArguments, depth + 1) && packList(x.packArguments, y.packArguments, depth + 1)
            && type(callable.typeId, otherCallable.typeId, depth + 1);
    }
    bool type(Luau::TypeId a, Luau::TypeId b, size_t depth = 0) {
        if (depth > 128 || ++visits > 10000) return false;
        a = Luau::follow(a); b = Luau::follow(b);
        if (auto prior = types.find(a); prior != types.end()) return prior->second == b;
        if (reverseTypes.count(b)) return false;
        types[a] = b; reverseTypes[b] = a;
        // Even pointer-equal declaration carriers require current owner,
        // executable/capture provenance and complete environment validation.
        if (auto x = Luau::get<Luau::TypeFunctionInstanceType>(a)) {
            auto y = Luau::get<Luau::TypeFunctionInstanceType>(b);
            return y && executable(a, b, *x, *y, depth + 1);
        }
        // Identical persistent graphs still contain source roles. Traverse
        // their children instead of letting pointer equality bypass the view.
        if (a == b) {
            if (auto x = Luau::get<Luau::FunctionType>(a))
                return functionMetadata(a, b) && pack(x->argTypes, x->argTypes, depth + 1) && pack(x->retTypes, x->retTypes, depth + 1);
            if (auto x = Luau::get<Luau::TableType>(a)) {
                if (!tableMetadata(a, b)) return false;
                for (const auto& [name, value] : x->props) if (!property(value, value, depth + 1)) return false;
                if (x->indexer && (!type(x->indexer->indexType, x->indexer->indexType, depth + 1)
                    || !type(x->indexer->indexResultType, x->indexer->indexResultType, depth + 1))) return false;
                return optionalType(x->boundTo, x->boundTo, depth + 1)
                    && typeList(x->instantiatedTypeParams, x->instantiatedTypeParams, depth + 1)
                    && packList(x->instantiatedTypePackParams, x->instantiatedTypePackParams, depth + 1);
            }
            if (auto x = Luau::get<Luau::MetatableType>(a)) return type(x->table, x->table, depth + 1) && type(x->metatable, x->metatable, depth + 1);
            if (auto x = Luau::get<Luau::UnionType>(a)) return typeList(x->options, x->options, depth + 1);
            if (auto x = Luau::get<Luau::IntersectionType>(a)) return typeList(x->parts, x->parts, depth + 1);
            if (auto x = Luau::get<Luau::NegationType>(a)) return type(x->ty, x->ty, depth + 1);
            if (auto x = Luau::get<Luau::PrimitiveType>(a)) return optionalType(x->metatable, x->metatable, depth + 1);
            return true;
        }
        if (a->persistent != b->persistent || a->documentationSymbol != b->documentationSymbol) return false;
        if (auto x = Luau::get<Luau::PrimitiveType>(a)) {
            auto y = Luau::get<Luau::PrimitiveType>(b);
            return y && x->type == y->type && optionalType(x->metatable, y->metatable, depth + 1);
        }
        if (auto x = Luau::get<Luau::SingletonType>(a)) {
            auto y = Luau::get<Luau::SingletonType>(b); return y && *x == *y;
        }
        if (auto x = Luau::get<Luau::GenericType>(a)) {
            auto y = Luau::get<Luau::GenericType>(b);
            return y && genericBinders.count(a) && x->name == y->name && x->explicitName == y->explicitName
                && x->polarity == y->polarity && x->level.level == y->level.level
                && x->level.subLevel == y->level.subLevel && scope(x->scope, y->scope);
        }
        if (auto x = Luau::get<Luau::TableType>(a)) {
            auto y = Luau::get<Luau::TableType>(b);
            if (!y || x->state != y->state || x->level.level != y->level.level || x->level.subLevel != y->level.subLevel
                || !scope(x->scope, y->scope) || x->name != y->name || x->syntheticName != y->syntheticName
                || x->definitionModuleName != y->definitionModuleName
                || x->tags != y->tags || x->remainingProps != y->remainingProps || x->props.size() != y->props.size()
                || bool(x->indexer) != bool(y->indexer) || !tableMetadata(a, b)) return false;
            auto right = y->props.begin();
            for (const auto& [name, value] : x->props) {
                if (name != right->first || !property(value, right->second, depth + 1)) return false;
                ++right;
            }
            if (x->indexer && (x->indexer->isReadOnly != y->indexer->isReadOnly
                || !type(x->indexer->indexType, y->indexer->indexType, depth + 1)
                || !type(x->indexer->indexResultType, y->indexer->indexResultType, depth + 1))) return false;
            return optionalType(x->boundTo, y->boundTo, depth + 1)
                && typeList(x->instantiatedTypeParams, y->instantiatedTypeParams, depth + 1)
                && packList(x->instantiatedTypePackParams, y->instantiatedTypePackParams, depth + 1);
        }
        if (auto x = Luau::get<Luau::MetatableType>(a)) {
            auto y = Luau::get<Luau::MetatableType>(b);
            return y && x->syntheticName == y->syntheticName && type(x->table, y->table, depth + 1)
                && type(x->metatable, y->metatable, depth + 1);
        }
        if (auto x = Luau::get<Luau::UnionType>(a)) {
            auto y = Luau::get<Luau::UnionType>(b); return y && typeList(x->options, y->options, depth + 1);
        }
        if (auto x = Luau::get<Luau::IntersectionType>(a)) {
            auto y = Luau::get<Luau::IntersectionType>(b); return y && typeList(x->parts, y->parts, depth + 1);
        }
        if (auto x = Luau::get<Luau::NegationType>(a)) {
            auto y = Luau::get<Luau::NegationType>(b); return y && type(x->ty, y->ty, depth + 1);
        }
        if (Luau::get<Luau::AnyType>(a)) return Luau::get<Luau::AnyType>(b);
        if (Luau::get<Luau::UnknownType>(a)) return Luau::get<Luau::UnknownType>(b);
        if (Luau::get<Luau::NeverType>(a)) return Luau::get<Luau::NeverType>(b);
        if (Luau::get<Luau::NoRefineType>(a)) return Luau::get<Luau::NoRefineType>(b);
        auto left = Luau::get<Luau::FunctionType>(a), right = Luau::get<Luau::FunctionType>(b);
        if (!left || !right || left->generics.size() != right->generics.size()
            || left->genericPacks.size() != right->genericPacks.size()
            || left->magic || right->magic || left->deprecatedInfo || right->deprecatedInfo) return false;
        for (size_t i = 0; i < left->generics.size(); ++i) if (!bind(left->generics[i], right->generics[i])) return false;
        for (size_t i = 0; i < left->genericPacks.size(); ++i) if (!bind(left->genericPacks[i], right->genericPacks[i])) return false;
        if (left->level.level != right->level.level || left->level.subLevel != right->level.subLevel
            || left->tags != right->tags || left->hasSelf != right->hasSelf
            || left->hasNoFreeOrGenericTypes != right->hasNoFreeOrGenericTypes
            || left->isCheckedFunction != right->isCheckedFunction || left->isDeprecatedFunction != right->isDeprecatedFunction
            || left->argNames.size() != right->argNames.size() || bool(left->definition) != bool(right->definition)) return false;
        return pack(left->argTypes, right->argTypes, depth + 1) && pack(left->retTypes, right->retTypes, depth + 1)
            && functionMetadata(a, b);
    }
    bool pack(Luau::TypePackId a, Luau::TypePackId b, size_t depth = 0) {
        if (depth > 128 || ++visits > 10000) return false;
        a = Luau::follow(a); b = Luau::follow(b);
        if (auto prior = packs.find(a); prior != packs.end()) return prior->second == b;
        if (reversePacks.count(b)) return false;
        packs[a] = b; reversePacks[b] = a;
        if (a == b) {
            if (auto x = Luau::get<Luau::TypePack>(a))
                return typeList(x->head, x->head, depth + 1) && (!x->tail || pack(*x->tail, *x->tail, depth + 1));
            if (auto x = Luau::get<Luau::VariadicTypePack>(a)) return type(x->ty, x->ty, depth + 1);
            return true;
        }
        if (a->persistent != b->persistent) return false;
        if (auto x = Luau::get<Luau::GenericTypePack>(a)) {
            auto y = Luau::get<Luau::GenericTypePack>(b);
            return y && packBinders.count(a) && x->name == y->name && x->explicitName == y->explicitName
                && x->polarity == y->polarity && x->level.level == y->level.level
                && x->level.subLevel == y->level.subLevel && scope(x->scope, y->scope);
        }
        if (auto left = Luau::get<Luau::TypePack>(a)) {
            auto right = Luau::get<Luau::TypePack>(b);
            if (!right || left->head.size() != right->head.size() || bool(left->tail) != bool(right->tail)) return false;
            for (size_t i = 0; i < left->head.size(); ++i) if (!type(left->head[i], right->head[i], depth + 1)) return false;
            return !left->tail || pack(*left->tail, *right->tail, depth + 1);
        }
        if (auto left = Luau::get<Luau::VariadicTypePack>(a)) {
            auto right = Luau::get<Luau::VariadicTypePack>(b);
            return right && left->hidden == right->hidden && type(left->ty, right->ty, depth + 1);
        }
        return false;
    }
};
std::string entryKey(const std::string& space, const std::string& name) { return space + ":" + name; }
void sourceField(SourceMetadataFacts& facts, const SourceLocationProjector& source, const std::string& module,
    const char* kind, const std::string& name, const Luau::Location& location) {
    if (auto projected = source(module, location)) facts.fields.push_back({kind, name, 0, std::move(*projected)});
    else facts.complete = false;
}
void mergeTableFacts(TableSources& tables, Luau::TypeId type, const SourceMetadataFacts& facts) {
    auto [prior, inserted] = tables.emplace(type, facts);
    if (!inserted && !equalSourceFacts(prior->second, facts)) {
        prior->second.fields.clear(); prior->second.complete = false; prior->second.ambiguous = true;
    }
}
// Birth evidence comes from exact checked AST-to-cell entries and the native
// property creation roles. A table's module string alone proves no property.
struct TableSourceScan : Luau::AstVisitor {
    const Luau::Module& module;
    const std::string& name;
    const SourceLocationProjector& source;
    TableSources tables;
    std::set<Luau::TypeId> assigned;
    bool unknownAssignment = false;
    TableSourceScan(const Luau::Module& module, const std::string& name, const SourceLocationProjector& source)
        : module(module), name(name), source(source) {}
    void assignment(Luau::AstExpr* target) {
        Luau::AstExpr* container = nullptr;
        if (auto index = target->as<Luau::AstExprIndexName>()) container = index->expr;
        else if (auto index = target->as<Luau::AstExprIndexExpr>()) container = index->expr;
        if (!container) return;
        auto type = module.astTypes.find(container);
        if (!type) { unknownAssignment = true; return; }
        auto followed = Luau::follow(*type);
        if (Luau::get<Luau::TableType>(followed)) assigned.insert(followed);
        else unknownAssignment = true;
    }
    bool visit(Luau::AstStatAssign* statement) override { for (auto target : statement->vars) assignment(target); return true; }
    bool visit(Luau::AstStatCompoundAssign* statement) override { assignment(statement->var); return true; }
    bool visit(Luau::AstTypeTable* node) override {
        auto resolved = module.astResolvedTypes.find(node); if (!resolved) return true;
        auto type = Luau::follow(*resolved); auto table = Luau::get<Luau::TableType>(type);
        if (!table || table->definitionModuleName != name || table->definitionLocation != node->location) return true;
        SourceMetadataFacts facts; sourceField(facts, source, name, "table-definition", "", node->location);
        if (bool(table->indexer) != bool(node->indexer) || table->props.size() != node->props.size) facts.complete = false;
        if (table->indexer && node->indexer) {
            // Prove the own written indexer's checked birth. Indexer edges
            // and access stay semantic; TableIndexer has no source range.
            auto key = module.astResolvedTypes.find(node->indexer->indexType);
            auto value = module.astResolvedTypes.find(node->indexer->resultType);
            const bool readOnly = node->indexer->access == Luau::AstTableAccess::Read;
            if (!key || !value || (node->indexer->access != Luau::AstTableAccess::Read
                && node->indexer->access != Luau::AstTableAccess::ReadWrite)
                || table->indexer->isReadOnly != readOnly
                || Luau::follow(table->indexer->indexType) != Luau::follow(*key)
                || Luau::follow(table->indexer->indexResultType) != Luau::follow(*value)) facts.complete = false;
        }
        std::set<std::string> keys;
        for (const auto& property : node->props) {
            const std::string key = property.name.value;
            auto found = table->props.find(key); auto value = module.astResolvedTypes.find(property.type);
            if (!keys.insert(key).second || found == table->props.end() || !value) { facts.complete = false; continue; }
            const auto& native = found->second;
            const bool read = property.access != Luau::AstTableAccess::Write, write = property.access != Luau::AstTableAccess::Read;
            if (bool(native.readTy) != read || bool(native.writeTy) != write || native.location
                || !native.typeLocation || *native.typeLocation != property.location
                || (read && Luau::follow(*native.readTy) != Luau::follow(*value))
                || (write && Luau::follow(*native.writeTy) != Luau::follow(*value))) { facts.complete = false; continue; }
            sourceField(facts, source, name, "property-type-location", key, property.location);
        }
        mergeTableFacts(tables, type, facts); return true;
    }
    bool visit(Luau::AstExprTable* node) override {
        auto resolved = module.astTypes.find(node); if (!resolved) return true;
        auto type = Luau::follow(*resolved); auto table = Luau::get<Luau::TableType>(type);
        if (!table || table->definitionModuleName != name || table->definitionLocation != node->location) return true;
        SourceMetadataFacts facts; sourceField(facts, source, name, "table-definition", "", node->location);
        if (table->indexer || table->props.size() != node->items.size) facts.complete = false;
        std::set<std::string> keys;
        for (const auto& item : node->items) {
            auto keyNode = item.key ? item.key->as<Luau::AstExprConstantString>() : nullptr;
            if (!keyNode) { facts.complete = false; continue; }
            const std::string key(keyNode->value.data, keyNode->value.size);
            auto found = table->props.find(key); auto value = module.astTypes.find(item.value);
            if (!keys.insert(key).second || found == table->props.end() || !value) { facts.complete = false; continue; }
            const auto& native = found->second;
            if (!native.location || *native.location != keyNode->location || native.typeLocation || !native.readTy || !native.writeTy
                || Luau::follow(*native.readTy) != Luau::follow(*value) || Luau::follow(*native.writeTy) != Luau::follow(*value)) {
                facts.complete = false; continue;
            }
            sourceField(facts, source, name, "property-location", key, keyNode->location);
        }
        mergeTableFacts(tables, type, facts); return true;
    }
    void finish() { for (auto& [type, facts] : tables) if (unknownAssignment || assigned.count(type)) facts.complete = false; }
};
struct Snapshot {
    Luau::ModulePtr owner;
    Luau::TypeArena arena;
    std::map<std::string, Luau::Binding> values;
    std::map<std::string, Luau::TypeFun> aliases;
    std::map<const Luau::AstStatTypeFunction*, Luau::Binding> typeFunctionCallables;
    // Non-owning exact solved source-cell identity for each callable clone.
    // The snapshot's existing owner/borrowed snapshot retains its arena.
    std::map<const Luau::AstStatTypeFunction*, Luau::TypeId> typeFunctionCallableOrigins;
    std::map<std::string, SourceMetadataFacts> sourceFacts;
    TableSources tableSources;
    EntrySources entrySources;
    size_t generation = 0;
    bool hasTypeFunctions = false;
    Luau::Mode mode;
};
struct TypeFunctionScan : Luau::AstVisitor {
    bool found = false;
    bool visit(Luau::AstStatTypeFunction*) override { found = true; return false; }
};
std::shared_ptr<Snapshot> capture(Luau::Frontend& frontend, const std::string& name, const Snapshot* imported,
    const TableSources& tables, const EntrySources& entries) {
    auto result = std::make_shared<Snapshot>();
    result->owner = frontend.moduleResolver.getModule(name);
    if (!result->owner || !result->owner->hasModuleScope()) throw std::runtime_error("Missing checked prelude scope");
    result->mode = result->owner->mode;
    auto scope = result->owner->getModuleScope();
    Luau::CloneState clones{frontend.builtinTypes};
    std::map<std::string, Luau::Symbol> selected;
    for (const auto& [symbol, binding] : scope->bindings) {
        if (isSyntheticBindingName(symbol.c_str())) continue;
        auto prior = selected.find(symbol.c_str());
        if (prior == selected.end() || (symbol.local && (!prior->second.local
            || prior->second.local->location.begin < symbol.local->location.begin))) selected[symbol.c_str()] = symbol;
    }
    for (const auto& [name, symbol] : selected) {
        auto copy = Luau::clone(scope->bindings.at(symbol), result->arena, clones);
        // Sparkdown's imported binding is a type, not a declaration location
        // in the consumer's source. Function metadata remains on its type.
        copy.location = Luau::Location();
        Luau::persist(copy.typeId); result->values[name] = std::move(copy);
    }
    for (const auto* bindings : {&scope->exportedTypeBindings, &scope->privateTypeBindings})
        for (const auto& [key, value] : *bindings) {
            // Match Scope::lookupType: an exported alias wins over a private
            // entry with the same name, including an inherited private alias.
            if (result->aliases.count(key)) continue;
            auto copy = Luau::clone(value, result->arena, clones);
            Luau::persist(copy.type);
            for (const auto& parameter : copy.typeParams) {
                Luau::persist(parameter.ty); if (parameter.defaultValue) Luau::persist(*parameter.defaultValue);
            }
            for (const auto& parameter : copy.typePackParams) {
                Luau::persist(parameter.tp); if (parameter.defaultValue) Luau::persist(*parameter.defaultValue);
            }
            result->aliases[key] = std::move(copy);
        }
    // Only selected visible root aliases can expose a callable. An AST-wide
    // scan would incorrectly publish helpers private to a nested function.
    for (const auto& [name, alias] : result->aliases) {
        auto function = Luau::get<Luau::TypeFunctionInstanceType>(Luau::follow(alias.type));
        if (!function || !function->userFuncData.definition) continue;
        auto definition = function->userFuncData.definition;
        if (result->typeFunctionCallables.count(definition)) continue;
        std::optional<Luau::Binding> binding;
        if (auto signature = result->owner->astScopes.find(definition->body); signature && *signature && (*signature)->parent)
            binding = (*signature)->parent->linearSearchForBinding(definition->name.value, false);
        else if (imported) {
            auto prior = imported->typeFunctionCallables.find(definition);
            if (prior != imported->typeFunctionCallables.end()) binding = prior->second;
        }
        if (!binding) throw std::runtime_error("Missing checked lexical type-function callable: " + name);
        auto copy = Luau::clone(*binding, result->arena, clones);
        copy.location = Luau::Location();
        Luau::persist(copy.typeId); result->typeFunctionCallables[definition] = std::move(copy);
        result->typeFunctionCallableOrigins[definition] = binding->typeId;
    }
    TypeFunctionScan scan; result->owner->root->visit(&scan); result->hasTypeFunctions = scan.found;
    for (const auto& [type, facts] : tables) {
        auto copy = clones.seenTypes.find(type);
        if (copy != clones.seenTypes.end()) {
            auto cloned = Luau::follow(copy->second);
            if (Luau::get<Luau::TableType>(cloned)) mergeTableFacts(result->tableSources, cloned, facts);
        } else if (type->persistent) mergeTableFacts(result->tableSources, type, facts);
    }
    result->entrySources = entries;
    for (auto& [entry, facts] : result->entrySources) {
        Luau::TypeId type = nullptr;
        if (entry.compare(0, 6, "alias:") == 0) {
            const auto key = entry.substr(6);
            auto alias = result->aliases.find(key);
            // Scope::lookupType selects exported before private. Verify the
            // selected root's exact clone before attaching its source facts;
            // another copied cell must never inherit those coordinates.
            auto selected = scope->exportedTypeBindings.find(key);
            const Luau::TypeFun* original = selected == scope->exportedTypeBindings.end() ? nullptr : &selected->second;
            if (!original) { auto value = scope->privateTypeBindings.find(key); if (value != scope->privateTypeBindings.end()) original = &value->second; }
            Luau::TypeId expected = nullptr;
            if (original) {
                auto followed = Luau::follow(original->type); auto clone = clones.seenTypes.find(followed);
                if (clone != clones.seenTypes.end()) expected = Luau::follow(clone->second);
                else if (followed->persistent) expected = followed;
            }
            if (alias != result->aliases.end()) type = alias->second.type;
            if (!original || alias == result->aliases.end() || !expected || Luau::follow(type) != expected
                || alias->second.definitionLocation != original->definitionLocation) facts.complete = false;
        } else if (entry.compare(0, 6, "value:") == 0) {
            auto value = result->values.find(entry.substr(6)); if (value != result->values.end()) type = value->second.typeId;
        }
        if (std::any_of(facts.fields.begin(), facts.fields.end(), [](const auto& field) { return field.kind == "table-definition"; })
            && (!type || !result->tableSources.count(Luau::follow(type)))) facts.complete = false;
    }
    return result;
}
std::optional<ExecutableOrigins> executableOrigins(const Snapshot& snapshot) {
    ExecutableOrigins result; result.owner = snapshot.owner.get();
    if (!result.owner || !result.owner->root || !result.owner->hasModuleScope()) return std::nullopt;
    auto scope = result.owner->getModuleScope();
    if (result.owner->root->body.size > 10000 || snapshot.aliases.size() > 10000
        || result.owner->typeFunctionAliases.size() > 10000) return std::nullopt;
    size_t originWork = result.owner->typeFunctionAliases.size();
    for (const auto& alias : result.owner->typeFunctionAliases) result.capturedAliases.insert(alias.get());
    std::map<std::string, const Luau::AstStat*> declarations;
    // Only direct root declarations may establish this slice's provenance.
    // Duplicate names (even a losing shadow) need a more precise scope proof.
    for (auto statement : result.owner->root->body) {
        if (++originWork > 10000) return std::nullopt;
        const char* name = nullptr;
        if (auto alias = statement->as<Luau::AstStatTypeAlias>()) name = alias->name.value;
        else if (auto function = statement->as<Luau::AstStatTypeFunction>()) name = function->name.value;
        if (name && !declarations.emplace(name, statement).second) return std::nullopt;
    }
    for (const auto& [name, alias] : snapshot.aliases) {
        if (++originWork > 10000) return std::nullopt;
        auto syntax = declarations.find(name); if (syntax == declarations.end()) return std::nullopt;
        auto exported = scope->exportedTypeBindings.find(name);
        const Luau::TypeFun* native = exported == scope->exportedTypeBindings.end() ? nullptr : &exported->second;
        if (!native) {
            auto local = scope->privateTypeBindings.find(name);
            if (local != scope->privateTypeBindings.end()) native = &local->second;
        }
        if (!native || native->definitionLocation != alias.definitionLocation
            || native->definitionLocation != std::optional<Luau::Location>{syntax->second->location}) return std::nullopt;
        if (auto declaration = syntax->second->as<Luau::AstStatTypeAlias>()) {
            auto reference = declaration->type->as<Luau::AstTypeReference>();
            // Direct primitive aliases have no ordinary-value/require/body
            // dependencies. No name-based recovery for typeof, applications,
            // generic/default, qualified, inferred or inherited aliases.
            if (!reference || reference->prefix || reference->prefixLocal || reference->prefixLocation
                || reference->hasParameterList || reference->parameters.size || declaration->generics.size
                || declaration->genericPacks.size || !native->typeParams.empty() || !native->typePackParams.empty()
                || !alias.typeParams.empty() || !alias.typePackParams.empty()
                || !(reference->name == "number" || reference->name == "string" || reference->name == "boolean")) return std::nullopt;
            auto resolved = result.owner->astResolvedTypes.find(declaration->type);
            if (!resolved || Luau::follow(*resolved) != Luau::follow(native->type)
                || !Luau::get<Luau::PrimitiveType>(Luau::follow(native->type))
                || Luau::follow(alias.type) != Luau::follow(native->type)) return std::nullopt;
            result.aliases.emplace(name, ExecutableOrigins::Alias{declaration, native});
        } else if (auto declaration = syntax->second->as<Luau::AstStatTypeFunction>()) {
            auto carrier = Luau::follow(alias.type); auto function = Luau::get<Luau::TypeFunctionInstanceType>(carrier);
            auto original = Luau::get<Luau::TypeFunctionInstanceType>(Luau::follow(native->type));
            auto callable = snapshot.typeFunctionCallables.find(declaration);
            auto callableOrigin = snapshot.typeFunctionCallableOrigins.find(declaration);
            auto signature = result.owner->astScopes.find(declaration->body);
            if (!function || !original || declaration->hasErrors || !declaration->body || callable == snapshot.typeFunctionCallables.end()
                || callableOrigin == snapshot.typeFunctionCallableOrigins.end()
                || !signature || !*signature || !(*signature)->parent
                || original->userFuncData.definition != declaration || function->userFuncData.definition != declaration
                || original->userFuncData.owner.lock().get() != result.owner || function->userFuncData.owner.lock().get() != result.owner
                || function->function != original->function || function->state != original->state
                || bool(function->userFuncName) != bool(original->userFuncName)
                || !function->userFuncName || !sameName(*function->userFuncName, declaration->name)
                || !sameName(*function->userFuncName, *original->userFuncName)
                || function->userFuncData.environmentFunction.size() != original->userFuncData.environmentFunction.size()
                || function->userFuncData.environmentAlias.size() != original->userFuncData.environmentAlias.size()) return std::nullopt;
            // Clone preserves executable captures as actual native references;
            // verify those references before interpreting any cloned carrier.
            for (const auto& [key, value] : function->userFuncData.environmentFunction) {
                if (++originWork > 10000) return std::nullopt;
                auto prior = original->userFuncData.environmentFunction.find(key);
                if (!prior || *prior != value) return std::nullopt;
            }
            for (const auto& [key, value] : function->userFuncData.environmentAlias) {
                if (++originWork > 10000) return std::nullopt;
                auto prior = original->userFuncData.environmentAlias.find(key);
                if (!prior || *prior != value) return std::nullopt;
            }
            auto nativeCallable = (*signature)->parent->linearSearchForBinding(declaration->name.value, false);
            if (!nativeCallable || nativeCallable->typeId != callableOrigin->second
                || !result.declarations.emplace(declaration, ExecutableOrigins::Declaration{carrier, &callable->second}).second)
                return std::nullopt;
        } else return std::nullopt;
    }
    if (result.declarations.empty()) return std::nullopt;
    return result;
}
bool equivalent(const Snapshot& a, const Snapshot& b, SourceMetadataCorrespondences& metadata) {
    if (a.mode != b.mode || a.hasTypeFunctions != b.hasTypeFunctions || a.values.size() != b.values.size()
        || a.aliases.size() != b.aliases.size()) return false;
    ExportGraph graph(a.sourceFacts, b.sourceFacts, a.tableSources, b.tableSources, a.entrySources, b.entrySources);
    std::optional<ExecutableOrigins> oldExecutables, newExecutables;
    if (a.hasTypeFunctions) {
        oldExecutables = executableOrigins(a); newExecutables = executableOrigins(b);
        if (!oldExecutables || !newExecutables) return false;
        graph.oldExecutables = &*oldExecutables; graph.newExecutables = &*newExecutables;
    }
    auto right = b.values.begin();
    if (!graph.bindScope(a.owner->getModuleScope().get(), b.owner->getModuleScope().get())) return false;
    // Environments can refer to a later root declaration. Establish every
    // declaration's quantified parameter pairing before traversing recursive
    // callable edges; all aliases/defaults/types are still checked below.
    if (a.hasTypeFunctions) {
        auto other = b.aliases.begin();
        for (const auto& [name, alias] : a.aliases) {
            const auto& [otherName, next] = *other++;
            if (name != otherName || alias.typeParams.size() != next.typeParams.size()
                || alias.typePackParams.size() != next.typePackParams.size()) return false;
            for (size_t i = 0; i < alias.typeParams.size(); ++i) if (!graph.bind(alias.typeParams[i].ty, next.typeParams[i].ty)) return false;
            for (size_t i = 0; i < alias.typePackParams.size(); ++i) if (!graph.bind(alias.typePackParams[i].tp, next.typePackParams[i].tp)) return false;
        }
    }
    auto otherAlias = b.aliases.begin();
    for (const auto& [name, alias] : a.aliases) {
        if (name != otherAlias->first || !graph.executableAlias(name) || !graph.alias(name, alias, otherAlias->second)) return false;
        ++otherAlias;
    }
    for (const auto& [name, left] : a.values) {
        const auto& [otherName, other] = *right++;
        if (name != otherName || left.location != other.location || left.deprecated != other.deprecated
            || left.deprecatedSuggestion != other.deprecatedSuggestion || left.documentationSymbol != other.documentationSymbol
            || !graph.type(left.typeId, other.typeId)) return false;
    }
    metadata = std::move(graph.metadata); return true;
}
} // namespace

struct IncrementalScopes::Impl {
    std::vector<std::string> programValues, programTypes;
    std::map<std::string, std::string> links;
    std::map<std::string, std::shared_ptr<Snapshot>> preludes, flowOwners;
    struct Borrower {
        std::weak_ptr<Luau::Module> module;
        std::vector<std::shared_ptr<Snapshot>> snapshots;
        std::map<std::string, SourceMetadataFacts> sourceFacts;
        TableSources tableSources;
        EntrySources entrySources;
    };
    std::map<std::string, Borrower> borrowers;
    // An equivalent new diagnostic module need not replace the borrowed graph
    // owner. Remember its identity separately to avoid re-cloning cached roots.
    std::map<std::string, std::weak_ptr<Luau::Module>> observedPreludes;
    struct MetadataView {
        std::weak_ptr<Snapshot> snapshot;
        // Always original retained coordinates/revision -> latest checked
        // facts. This map never owns a diagnostic module, AST or graph arena.
        SourceMetadataCorrespondences correspondences;
        size_t generation = 0;
    };
    std::map<const Snapshot*, std::shared_ptr<const MetadataView>> metadataViews, stagedMetadataViews;
    struct Lease { std::weak_ptr<Luau::Module> module; std::shared_ptr<Snapshot> snapshot; };
    std::vector<Lease> leases;
    size_t nextGeneration = 0;
    size_t nextMetadataGeneration = 0;
    std::optional<SourceMetadataCorrespondence> effectiveFacts(const SourceMetadataFacts& origin) const {
        if (!origin.complete || origin.ambiguous) return std::nullopt;
        std::map<std::string, SourceMetadataFacts> effective;
        // Exact original facts include generation, role, module and position.
        // A second shift compares the retained original snapshot to the latest
        // check, rather than applying a previous-to-next coordinate delta.
        for (const auto& [owner, view] : metadataViews) {
            if (view->snapshot.expired()) continue;
            for (const auto& [anchor, correspondence] : view->correspondences)
                if (equalSourceFacts(correspondence.origin, origin))
                    mergeSourceFacts(effective, "selected", correspondence.effective);
        }
        auto selected = effective.find("selected");
        if (selected != effective.end() && (!selected->second.complete || selected->second.ambiguous)) return std::nullopt;
        return SourceMetadataCorrespondence{origin, selected == effective.end() ? origin : selected->second};
    }
    void stageMetadata(const std::shared_ptr<Snapshot>& snapshot, SourceMetadataCorrespondences correspondences) {
        auto view = std::make_shared<MetadataView>(); view->snapshot = snapshot;
        for (auto& [anchor, correspondence] : correspondences)
            if (!equalSourceFacts(correspondence.origin, correspondence.effective))
                view->correspondences.emplace(anchor, std::move(correspondence));
        stagedMetadataViews[snapshot.get()] = std::move(view);
    }
    void retire(Luau::Frontend& frontend, const std::string& name) {
        auto owner = flowOwners.find(name);
        if (owner == flowOwners.end()) return;
        // New-solver SCC checking can put a placeholder in the resolver before
        // prepare runs. Lease the actual module recorded after the prior check,
        // never whichever object currently occupies that resolver slot.
        auto borrower = borrowers.find(name);
        if (borrower != borrowers.end() && borrower->second.module.lock() != owner->second->owner)
            leases.push_back({borrower->second.module, owner->second});
        flowOwners.erase(owner);
    }
};
IncrementalScopes::IncrementalScopes() : impl(std::make_unique<Impl>()) {}
IncrementalScopes::~IncrementalScopes() = default;
void IncrementalScopes::programBindings(std::vector<std::string> values, std::vector<std::string> types) {
    impl->programValues = std::move(values); impl->programTypes = std::move(types);
}
bool IncrementalScopes::link(const std::string& consumer, const std::string& prelude) {
    if (consumer == prelude) throw std::runtime_error("Cyclic prelude scope relationship");
    std::set<std::string> visited{consumer}; auto current = prelude;
    while (true) {
        if (!visited.insert(current).second) throw std::runtime_error("Cyclic prelude scope relationship");
        auto next = impl->links.find(current); if (next == impl->links.end()) break; current = next->second;
    }
    auto prior = impl->links.find(consumer);
    if (prior != impl->links.end() && prior->second == prelude) return false;
    impl->links[consumer] = prelude; return true;
}
bool IncrementalScopes::unlink(Luau::Frontend& frontend, const std::string& consumer) {
    auto link = impl->links.find(consumer); if (link == impl->links.end()) return false;
    auto target = link->second; impl->links.erase(link);
    if (!isPrelude(target)) { impl->preludes.erase(target); impl->observedPreludes.erase(target); }
    impl->retire(frontend, consumer); collect(); return true;
}
std::vector<std::string> IncrementalScopes::consumers(const std::string& prelude) const {
    std::vector<std::string> result;
    for (const auto& [consumer, target] : impl->links) if (target == prelude) result.push_back(consumer);
    return result;
}
bool IncrementalScopes::isPrelude(const std::string& name) const { return !consumers(name).empty(); }
std::string IncrementalScopes::preludeOf(const std::string& name) const { auto i = impl->links.find(name); return i == impl->links.end() ? std::string() : i->second; }
void IncrementalScopes::prepare(Luau::Frontend& frontend, const std::string& name, const Luau::ScopePtr& scope) {
    for (const auto& value : impl->programValues) {
        auto symbol = frontend.globals.globalNames.names->getOrAdd(value.c_str());
        if (!frontend.globals.globalScope->lookup(Luau::Symbol(symbol)))
            scope->bindings[Luau::Symbol(symbol)] = {frontend.builtinTypes->anyType, Luau::Location()};
    }
    for (const auto& type : impl->programTypes)
        if (!frontend.globals.globalScope->lookupType(type)) scope->privateTypeBindings[type] = Luau::TypeFun{frontend.builtinTypes->anyType};
    auto link = impl->links.find(name); if (link == impl->links.end()) return;
    auto prelude = impl->preludes.find(link->second);
    if (prelude == impl->preludes.end() || frontend.isDirty(link->second)) throw std::runtime_error("Flow requires a checked prelude snapshot");
    impl->retire(frontend, name);
    auto snapshot = prelude->second; impl->flowOwners[name] = snapshot;
    for (const auto& [key, binding] : snapshot->values)
        scope->bindings[frontend.globals.globalNames.names->getOrAdd(key.c_str())] = binding;
    for (const auto& [key, alias] : snapshot->aliases) scope->privateTypeBindings[key] = alias;
    collect();
}
void IncrementalScopes::prepareTypeFunctions(Luau::Frontend& frontend, const std::string& name, const Luau::ScopePtr& scope) {
    auto link = impl->links.find(name); if (link == impl->links.end()) return;
    auto prelude = impl->preludes.find(link->second);
    if (prelude == impl->preludes.end() || frontend.isDirty(link->second))
        throw std::runtime_error("Type function requires a checked lexical prelude snapshot");
    const auto& snapshot = *prelude->second;
    for (const auto& [name, alias] : snapshot.aliases) {
        auto function = Luau::get<Luau::TypeFunctionInstanceType>(Luau::follow(alias.type));
        if (!function || !function->userFuncData.definition) continue;
        auto callable = snapshot.typeFunctionCallables.find(function->userFuncData.definition);
        if (callable == snapshot.typeFunctionCallables.end())
            throw std::runtime_error("Missing retained lexical type-function callable: " + name);
        auto symbol = frontend.globals.globalNames.names->getOrAdd(name.c_str());
        scope->bindings[symbol] = callable->second;
    }
}
void IncrementalScopes::checked(Luau::Frontend& frontend, const std::string& name, const SourceLocationProjector& source) {
    auto current = frontend.moduleResolver.getModule(name);
    if (!current) return;
    auto prior = impl->borrowers.find(name);
    if (prior != impl->borrowers.end()) {
        if (prior->second.module.lock() == current) return;
        for (const auto& snapshot : prior->second.snapshots)
            if (prior->second.module.lock() != snapshot->owner) impl->leases.push_back({prior->second.module, snapshot});
    }
    // Persistent imported return/alias types can borrow a scope through require
    // even if this module has no direct scope link. Retain all such arenas for
    // the actual module identity; a later edited require graph must not erase
    // the old graph's lifetime evidence.
    Impl::Borrower next; next.module = current;
    std::set<std::string> visited;
    std::set<Snapshot*> retained;
    std::vector<std::string> pending{name};
    while (!pending.empty()) {
        auto module = pending.back(); pending.pop_back();
        if (!visited.insert(module).second) continue;
        auto owner = impl->flowOwners.find(module);
        // A snapshot already owns its module. Retaining that same snapshot in
        // the module's weak-lifetime record would make expiration impossible.
        if (owner != impl->flowOwners.end() && owner->second->owner != current
            && retained.insert(owner->second.get()).second) next.snapshots.push_back(owner->second);
        auto node = frontend.sourceNodes.find(module);
        if (node != frontend.sourceNodes.end()) for (const auto& dependency : node->second->requireSet) pending.push_back(dependency);
    }
    // Preserve originating facts for ordinary require copies too. Capturing
    // facts is separate from retaining graph owners: Frontend owns these native
    // dependency modules, and this record contains scalar values only.
    for (const auto& dependency : visited) if (dependency != name) {
        auto origin = impl->borrowers.find(dependency);
        if (origin != impl->borrowers.end() && origin->second.module.lock() == frontend.moduleResolver.getModule(dependency))
            for (const auto& [anchor, facts] : origin->second.sourceFacts) mergeSourceFacts(next.sourceFacts, anchor, facts);
    }
    // Record while the actual originating input is still current. Foreign
    // copied function metadata is resolved from retained snapshot facts below,
    // not projected against a possibly edited foreign source.
    auto record = [&](Luau::TypeId type) {
        const auto* function = Luau::get<Luau::FunctionType>(Luau::follow(type));
        if (!function || !function->definition || !function->definition->definitionModuleName) return;
        const auto& originModule = *function->definition->definitionModuleName;
        const auto anchor = functionSourceAnchor(type);
        if (originModule != name) {
            bool retained = false;
            for (const auto& snapshot : next.snapshots) {
                auto origin = snapshot->sourceFacts.find(anchor);
                if (origin != snapshot->sourceFacts.end()) { mergeSourceFacts(next.sourceFacts, anchor, origin->second); retained = true; }
            }
            if (retained) return;
            // Ordinary require copies originate in this actual checked require
            // closure. Lexical origins outside it require a retained record.
            if (!visited.count(originModule) || frontend.isDirty(originModule)) return;
        }
        mergeSourceFacts(next.sourceFacts, anchor, functionSourceFacts(type, source));
    };
    for (const auto& [expression, type] : current->astTypes) record(type);
    for (const auto& [expression, pack] : current->astTypePacks) if (auto type = Luau::first(pack)) record(*type);
    for (const auto& [location, scope] : current->scopes)
        for (const auto& [symbol, binding] : scope->bindings) record(binding.typeId);
    for (const auto& snapshot : next.snapshots)
        for (const auto& [type, facts] : snapshot->tableSources) mergeTableFacts(next.tableSources, type, facts);
    TableSourceScan ownTables(*current, name, source); current->root->visit(&ownTables); ownTables.finish();
    for (const auto& [type, facts] : ownTables.tables) mergeTableFacts(next.tableSources, type, facts);
    // Mutation in this borrower also invalidates birth-only evidence for a
    // directly imported cell. It never changes the predecessor's sidecar.
    for (auto& [type, facts] : next.tableSources)
        if (ownTables.unknownAssignment || ownTables.assigned.count(type)) facts.complete = false;
    if (current->hasModuleScope()) {
        const auto root = current->getModuleScope();
        auto appendTable = [&](SourceMetadataFacts& facts, Luau::TypeId type, bool required) {
            type = Luau::follow(type);
            if (!Luau::get<Luau::TableType>(type)) { if (required) facts.complete = false; return; }
            auto table = next.tableSources.find(type);
            if (table == next.tableSources.end()) { facts.complete = false; return; }
            facts.complete = facts.complete && table->second.complete; facts.ambiguous = facts.ambiguous || table->second.ambiguous;
            facts.fields.insert(facts.fields.end(), table->second.fields.begin(), table->second.fields.end());
        };
        auto installed = impl->flowOwners.find(name);
        std::set<std::string> selectedAliases;
        for (const auto* aliases : {&root->exportedTypeBindings, &root->privateTypeBindings}) for (const auto& [key, alias] : *aliases) {
            if (!selectedAliases.insert(key).second) continue; // Exact native root lookup precedence.
            SourceMetadataFacts facts;
            const auto entry = entryKey("alias", key);
            auto location = root->typeAliasLocations.find(key), nameLocation = root->typeAliasNameLocations.find(key);
            if (location != root->typeAliasLocations.end() && nameLocation != root->typeAliasNameLocations.end()
                && alias.definitionLocation && *alias.definitionLocation == location->second) {
                sourceField(facts, source, name, "alias-definition", key, location->second);
                sourceField(facts, source, name, "alias-name", key, nameLocation->second);
                appendTable(facts, alias.type, false);
            } else if (installed != impl->flowOwners.end()) {
                const auto& snapshot = *installed->second;
                auto original = snapshot.aliases.find(key);
                auto origin = snapshot.entrySources.find(entry);
                if (original != snapshot.aliases.end() && origin != snapshot.entrySources.end()
                    && original->second.type == alias.type && original->second.definitionLocation == alias.definitionLocation) facts = origin->second;
                else facts.complete = false;
            } else facts.complete = false;
            if (Luau::get<Luau::TableType>(Luau::follow(alias.type))) {
                auto table = next.tableSources.find(Luau::follow(alias.type));
                if (table == next.tableSources.end() || !table->second.complete || table->second.ambiguous) facts.complete = false;
            }
            mergeSourceFacts(next.entrySources, entry, facts);
        }
        std::map<std::string, Luau::Symbol> selected;
        for (const auto& [symbol, binding] : root->bindings) {
            if (isSyntheticBindingName(symbol.c_str())) continue;
            auto prior = selected.find(symbol.c_str());
            if (prior == selected.end() || (symbol.local && (!prior->second.local
                || prior->second.local->location.begin < symbol.local->location.begin))) selected[symbol.c_str()] = symbol;
        }
        for (const auto& [key, symbol] : selected) {
            SourceMetadataFacts facts; appendTable(facts, root->bindings.at(symbol).typeId, true);
            mergeSourceFacts(next.entrySources, entryKey("value", key), facts);
        }
    }
    impl->borrowers[name] = std::move(next);
}
std::optional<SourceMetadataCorrespondence> IncrementalScopes::sourceFacts(Luau::Frontend& frontend, const std::string& name, Luau::TypeId type) const {
    const auto anchor = functionSourceAnchor(type);
    if (anchor.empty()) return std::nullopt;
    auto borrower = impl->borrowers.find(name);
    if (borrower == impl->borrowers.end() || borrower->second.module.lock() != frontend.moduleResolver.getModule(name)) return std::nullopt;
    std::map<std::string, SourceMetadataFacts> origins;
    auto own = borrower->second.sourceFacts.find(anchor);
    if (own != borrower->second.sourceFacts.end()) mergeSourceFacts(origins, anchor, own->second);
    for (const auto& snapshot : borrower->second.snapshots) {
        auto origin = snapshot->sourceFacts.find(anchor);
        if (origin == snapshot->sourceFacts.end()) continue;
        mergeSourceFacts(origins, anchor, origin->second);
    }
    auto result = origins.find(anchor);
    if (result == origins.end() || result->second.ambiguous) return std::nullopt;
    std::map<std::string, SourceMetadataFacts> effective;
    for (const auto& [owner, view] : impl->metadataViews) {
        if (view->snapshot.expired()) continue;
        auto correspondence = view->correspondences.find(anchor);
        if (correspondence == view->correspondences.end()
            || !equalSourceFacts(correspondence->second.origin, result->second)) continue;
        mergeSourceFacts(effective, anchor, correspondence->second.effective);
    }
    auto current = effective.find(anchor);
    if (current != effective.end() && current->second.ambiguous) return std::nullopt;
    return SourceMetadataCorrespondence{result->second, current == effective.end() ? result->second : current->second};
}
std::optional<SourceMetadataCorrespondence> IncrementalScopes::scopeSourceFacts(Luau::Frontend& frontend, const std::string& module,
    const std::string& space, const std::string& name) const {
    auto borrower = impl->borrowers.find(module);
    if (borrower == impl->borrowers.end() || borrower->second.module.lock() != frontend.moduleResolver.getModule(module)) return std::nullopt;
    auto entry = borrower->second.entrySources.find(entryKey(space, name));
    if (entry == borrower->second.entrySources.end() || !entry->second.complete || entry->second.ambiguous) return std::nullopt;
    // Copied entry records remain at their original revision. A committed
    // weak-owner view supplies current coordinates without touching TypeFun,
    // Property or the intentionally zero imported Binding.location.
    return impl->effectiveFacts(entry->second);
}
bool IncrementalScopes::publish(Luau::Frontend& frontend, const std::string& name) {
    auto module = frontend.moduleResolver.getModule(name);
    auto prior = impl->preludes.find(name);
    auto observed = impl->observedPreludes.find(name);
    if (prior != impl->preludes.end() && observed != impl->observedPreludes.end() && observed->second.lock() == module) return true;
    auto imports = impl->flowOwners.find(name);
    static const TableSources noTables; static const EntrySources noEntries;
    auto facts = impl->borrowers.find(name);
    auto next = capture(frontend, name, imports == impl->flowOwners.end() ? nullptr : imports->second.get(),
        facts == impl->borrowers.end() ? noTables : facts->second.tableSources,
        facts == impl->borrowers.end() ? noEntries : facts->second.entrySources);
    if (auto own = impl->borrowers.find(name); own != impl->borrowers.end()) next->sourceFacts = own->second.sourceFacts;
    if (imports != impl->flowOwners.end()) for (const auto& [anchor, facts] : imports->second->sourceFacts)
        mergeSourceFacts(next->sourceFacts, anchor, facts);
    impl->observedPreludes[name] = module;
    SourceMetadataCorrespondences metadata;
    if (prior != impl->preludes.end() && equivalent(*prior->second, *next, metadata)) {
        impl->stageMetadata(prior->second, std::move(metadata)); return true;
    }
    next->generation = ++impl->nextGeneration;
    impl->stageMetadata(next, {}); impl->preludes[name] = std::move(next); collect(); return false;
}
void IncrementalScopes::commitSourceMetadata() {
    for (const auto& [owner, staged] : impl->stagedMetadataViews) {
        auto snapshot = staged->snapshot.lock(); if (!snapshot) continue;
        auto prior = impl->metadataViews.find(owner);
        bool same = prior != impl->metadataViews.end() && prior->second->snapshot.lock() == snapshot
            && prior->second->correspondences.size() == staged->correspondences.size();
        if (same) for (const auto& [anchor, correspondence] : staged->correspondences) {
            auto previous = prior->second->correspondences.find(anchor);
            if (previous == prior->second->correspondences.end()
                || !equalSourceFacts(previous->second.origin, correspondence.origin)
                || !equalSourceFacts(previous->second.effective, correspondence.effective)) { same = false; break; }
        }
        if (!same) {
            auto committed = std::make_shared<Impl::MetadataView>(*staged);
            committed->generation = ++impl->nextMetadataGeneration; impl->metadataViews[owner] = std::move(committed);
        }
    }
    impl->stagedMetadataViews.clear(); collect();
}
void IncrementalScopes::remove(Luau::Frontend& frontend, const std::string& name) {
    impl->retire(frontend, name); impl->preludes.erase(name); impl->observedPreludes.erase(name); impl->links.erase(name); collect();
}
void IncrementalScopes::clearChecked() {
    impl->metadataViews.clear(); impl->stagedMetadataViews.clear();
    impl->preludes.clear(); impl->observedPreludes.clear(); impl->flowOwners.clear(); impl->borrowers.clear(); impl->leases.clear();
}
void IncrementalScopes::collect() {
    auto& leases = impl->leases;
    // Releasing a snapshot can release its owner and expire another record.
    // Iterate only while records disappear; no module/arena is synthesized.
    size_t prior;
    do {
        prior = impl->borrowers.size() + leases.size();
        for (auto i = impl->borrowers.begin(); i != impl->borrowers.end();)
            if (i->second.module.expired()) i = impl->borrowers.erase(i); else ++i;
        leases.erase(std::remove_if(leases.begin(), leases.end(), [](const Impl::Lease& lease) { return lease.module.expired(); }), leases.end());
    } while (impl->borrowers.size() + leases.size() < prior);
    for (auto* views : {&impl->metadataViews, &impl->stagedMetadataViews})
        for (auto i = views->begin(); i != views->end();)
            if (i->second->snapshot.expired()) i = views->erase(i); else ++i;
}
size_t IncrementalScopes::generation(const std::string& name) const { auto i = impl->preludes.find(name); return i == impl->preludes.end() ? 0 : i->second->generation; }
size_t IncrementalScopes::metadataGeneration(const std::string& name) const {
    auto snapshot = impl->preludes.find(name); if (snapshot == impl->preludes.end()) return 0;
    auto view = impl->metadataViews.find(snapshot->second.get());
    return view == impl->metadataViews.end() || view->second->snapshot.lock() != snapshot->second ? 0 : view->second->generation;
}
size_t IncrementalScopes::snapshotCount() const {
    std::set<const Snapshot*> retained;
    for (const auto& entry : impl->preludes) retained.insert(entry.second.get());
    for (const auto& entry : impl->flowOwners) retained.insert(entry.second.get());
    for (const auto& entry : impl->borrowers) for (const auto& snapshot : entry.second.snapshots) retained.insert(snapshot.get());
    for (const auto& lease : impl->leases) retained.insert(lease.snapshot.get());
    return retained.size();
}
size_t IncrementalScopes::flowOwnerCount() const { return impl->flowOwners.size(); }
size_t IncrementalScopes::leaseCount() const { return impl->leases.size(); }

} // namespace SparkdownAnalysis
