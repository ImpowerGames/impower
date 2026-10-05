# Pinned source metadata consumer audit

Pin: Luau 7d5f73364fdbbaa984fa545071630eba73cfea98. Read-only source evidence; not a runtime proof, exhaustive audit or permission to mutate the pin. Stage-one observer was built and passed; the subsequent monomorphic callable-only location view is authored but unbuilt. Alias/property/table/TF position comparisons remain strict.

## Callable metadata

ConstraintGenerator.cpp4368/4383/4424/4510 records actual argument names/locations. Lines4515–4517 assign FunctionDefinition definitionLocation, optional authored varargLocation and originalNameLocation. Anonymous functions receive a zero-width name location at function begin; the observer must not advertise it as an authored identifier. Extern method/global declarations assign callable metadata at2397–2399 and2522–2539. Definition files are not covered by the first input-origin observer yet.

Instantiation.cpp63–65 and Substitution.cpp88–94 copy FunctionDefinition and argNames. Native derivations can therefore carry original metadata independently from the exported function cell. The observer uses a full module/definition/name/vararg/argument native tuple restricted to retained borrower origins, not a display name or cross-project search.

ToString.cpp734/1840–1842 and AutocompleteCore.cpp1947–1948 consume argument NAMES; these remain semantic comparator fields. TypeAttach.cpp350–360 emits AST argument names with Location() instead of copying their positions. TypeFunctionRuntime.cpp2873 copies names when its flag is enabled; TypeFunctionRuntimeBuilder.cpp451–457 serializes names and1069–1075 reconstructs names with zero locations. They do not establish an authored position for a VM-produced function. Type-function-containing snapshots remain conservatively invalidated.

Follow-up exact-field search e3096b and FunctionArgument/FunctionDefinition search a8b895 over all pinned Analysis/src cpp files found callable position assignment/copy paths above, legacy TypeInfer assignment counterparts, and no additional direct callable-coordinate read. ToString's named function branch1840–1842 reads only names, and TypeAttach's argument rehydration355–360 deliberately supplies Location(). Table definition assignments in ConstraintSolver1585 and CG4019/4148/4743 are unchanged by this policy. This bounded field/reference audit supports the narrow monomorphic callable change, not the later alias/property/table or generic .location audit. Required actual body-warning/signature and current source-location controls still gate its acceptance.

## Table/property/alias and binding metadata

Anyification.cpp72, Instantiation.cpp157 and Substitution.cpp103 copy table definition locations; Substitution.cpp131 copies extern metadata. Clone.cpp220 copies Property.typeLocation. Module.cpp309 copies TypeFun.definitionLocation by value. ConstraintGenerator.cpp1268 uses a TypeFun definition location in a type-function environment binding, while1248 uses the actual type-function AST definition location. A future effective view must cover these copied alias/binding origins independently.

AstQuery.cpp333–336/372–376 and AutocompleteCore.cpp1450–1453 read Binding.location for lexical selection/visibility. Imported Sparkdown values are deliberately installed with zero location, while own declarations/parameters retain authoritative native local identity. A metadata view must not change that lexical policy or mutate the caller's scopes. TypeChecker2.cpp626 reads Scope.location for its own local scope search; that caller AST/scope remains unchanged in a reused unit. This does not prove every generic location read has been audited.

## Diagnostic formatting

Error.h110 has DuplicateTypeDefinition.previousLocation in addition to the primary TypeError.location. Error.cpp235–239 prints its previous line, and1168–1170 includes it in equality. ConstraintGenerator.cpp947/990/1052/1074 sets it from typeNameLocations. That map is populated by actual current-CG declarations at981/1041/1063/1079; no imported alias initialization of the map appeared in this bounded search. This is source evidence, not a passing cross-unit diagnostic-control result.

Error.cpp140–142 reads definition module names to distinguish identically printed types; module identity remains semantic. The bounded exact-field search found no callable/table/property position reads in Error.cpp, ToString.cpp, Subtyping.cpp or Unifier.cpp beyond the fields above. It does not replace a complete audit of generic .location reads, related locations or source-map publication. Required location-sensitive diagnostic controls remain pending before metadata equivalence is enabled.
