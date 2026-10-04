// Fixture.cpp's optional seed and doctest support are test-only linkage dependencies.
// Adapter methods avoid helpers that execute doctest CHECK/REQUIRE outside a test context.
#define DOCTEST_CONFIG_IMPLEMENT
#include "doctest.h"
#include <optional>
std::optional<unsigned> randomSeed;
