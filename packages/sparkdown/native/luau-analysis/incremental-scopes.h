#pragma once

#include "Luau/Frontend.h"
#include "source-metadata.h"
#include <memory>
#include <string>
#include <vector>

namespace SparkdownAnalysis {

// Checked graph storage stays native. Public callers see generations/work
// counts, never TypeIds, scopes, allocator views or module pointers.
class IncrementalScopes {
public:
    IncrementalScopes();
    ~IncrementalScopes();
    IncrementalScopes(const IncrementalScopes&) = delete;
    IncrementalScopes& operator=(const IncrementalScopes&) = delete;

    void programBindings(std::vector<std::string> values, std::vector<std::string> types);
    // Returns false for an unchanged relationship. The caller invalidates the
    // changed consumer through ordinary require bookkeeping separately.
    bool link(const std::string& consumer, const std::string& prelude);
    bool unlink(Luau::Frontend& frontend, const std::string& consumer);
    bool isPrelude(const std::string& module) const;
    std::string preludeOf(const std::string& consumer) const;
    std::vector<std::string> consumers(const std::string& prelude) const;
    void prepare(Luau::Frontend& frontend, const std::string& module, const Luau::ScopePtr& scope);
    // Called by the maintained hook for the separate module-local environment.
    // These callable bindings never enter ordinary/gameplay value scopes.
    void prepareTypeFunctions(Luau::Frontend& frontend, const std::string& module, const Luau::ScopePtr& scope);
    /** Binds the actual post-check borrower, after cyclic placeholders have been replaced. */
    void checked(Luau::Frontend& frontend, const std::string& module, const SourceLocationProjector& source);
    // Copied originating UTF16 facts for a selected callable. Null means that
    // its origin is unavailable; it must not be reinterpreted using new text.
    std::optional<SourceMetadataCorrespondence> sourceFacts(Luau::Frontend& frontend, const std::string& module, Luau::TypeId type) const;
    // Exact installed root namespace entry; no value/cursor/reference lookup.
    std::optional<SourceMetadataCorrespondence> scopeSourceFacts(Luau::Frontend& frontend, const std::string& module,
        const std::string& space, const std::string& name) const;
    // Capture a newly checked prelude. Equivalent exports keep their old
    // immutable graph; diagnostics remain owned by the newly checked module.
    bool publish(Luau::Frontend& frontend, const std::string& prelude);
    // Called only after the outer check has collected diagnostics and its
    // successful status. Failed checks reset the project, discarding staging.
    void commitSourceMetadata();
    void remove(Luau::Frontend& frontend, const std::string& module);
    // Must run before the Frontend's global arenas are destroyed. Relationships
    // and program names survive reset; borrowed checked graphs do not.
    void clearChecked();
    void collect();
    size_t generation(const std::string& prelude) const;
    size_t metadataGeneration(const std::string& prelude) const;
    size_t snapshotCount() const;
    size_t flowOwnerCount() const;
    size_t leaseCount() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace SparkdownAnalysis
