// A real doctest operation context is test-only; none of this enters production WASM.
#define DOCTEST_CONFIG_IMPLEMENT
#include "doctest.h"
#include "session.h"
#include <exception>
#include <optional>
std::optional<unsigned> randomSeed;

#ifndef LUAU_ASSERTENABLED
#error Conformance requires official Luau assertions in every translation unit
#endif

namespace
{
using namespace SparkdownConformance;
const std::function<std::string()>* activeOperation = nullptr;
const std::function<void()>* activeTeardown = nullptr;
std::string operationResult;
std::exception_ptr operationException;
std::optional<AssertionFacts> assertion;
bool failedAssert = false;
bool teardownCalled = false;
unsigned executedCases = 0;

void teardownFailure()
{
    if (!teardownCalled) { teardownCalled = true; (*activeTeardown)(); }
}
// Same no-debugger semantics as pinned tests/main.cpp105: ADD_FAIL_AT is
// doctest require, so it records failure and throws before the textual return1.
int testAssertionHandler(const char* expr, const char* file, int line, const char* function)
{
    if (!assertion) assertion = AssertionFacts{std::string(expr).substr(0, 4096),
        std::string(file).substr(0, 4096), line, std::string(function).substr(0, 4096)};
    ADD_FAIL_AT(file, line, "Assertion failed: ", std::string(expr));
    return 1;
}
struct OperationReporter : doctest::IReporter
{
    explicit OperationReporter(const doctest::ContextOptions&) {}
    void report_query(const doctest::QueryData&) override {}
    void test_run_start() override {}
    void test_run_end(const doctest::TestRunStats&) override {}
    void test_case_start(const doctest::TestCaseData&) override { ++executedCases; }
    void test_case_reenter(const doctest::TestCaseData&) override {}
    void test_case_end(const doctest::CurrentTestCaseStats&) override {}
    void test_case_exception(const doctest::TestCaseException&) override {}
    void subcase_start(const doctest::SubcaseSignature&) override {}
    void subcase_end() override {}
    void log_assert(const doctest::AssertData& value) override
    {
        if (value.m_failed && !(value.m_at & doctest::assertType::is_warn)) failedAssert = true;
    }
    void log_message(const doctest::MessageData& value) override
    {
        if (!(value.m_severity & doctest::assertType::is_warn)) failedAssert = true;
    }
    void test_case_skipped(const doctest::TestCaseData&) override {}
};
const int registeredReporter = doctest::registerReporter<OperationReporter>("sparkdown-operation", 0, true);

TEST_CASE("__sparkdown_native_operation")
{
    try
    {
        operationResult = (*activeOperation)();
        // A nonfatal upstream CHECK also fails the actual operation. Teardown
        // occurs while its genuine doctest context and handler are still active.
        if (failedAssert) teardownFailure();
    }
    catch (const doctest::detail::TestFailureException&)
    {
        teardownFailure();
        throw;
    }
    catch (...) { operationException = std::current_exception(); }
}
struct OperationScope
{
    Luau::AssertHandler previous;
    OperationScope(const std::function<std::string()>& operation, const std::function<void()>& teardown)
        : previous(Luau::assertHandler())
    {
        if (activeOperation) throw RequestError("Reentrant native conformance operation");
        activeOperation = &operation;
        activeTeardown = &teardown;
        operationResult.clear(); operationException = nullptr; assertion.reset();
        failedAssert = false; teardownCalled = false; executedCases = 0;
        Luau::assertHandler() = testAssertionHandler;
    }
    ~OperationScope()
    {
        Luau::assertHandler() = previous;
        activeOperation = nullptr; activeTeardown = nullptr;
        operationException = nullptr;
    }
};
}

namespace SparkdownConformance
{
std::string runConformanceOperation(const std::function<std::string()>& operation, const std::function<void()>& teardown)
{
    OperationScope scope(operation, teardown);
    doctest::Context context;
    context.setOption("test-case", "__sparkdown_native_operation");
    context.setOption("reporters", "sparkdown-operation");
    context.setOption("no-breaks", true);
    context.setOption("no-colors", true);
    const int status = context.run();
    if (assertion) throw AssertionFailure(*assertion);
    if (status != 0 || failedAssert || executedCases != 1)
        throw FixtureTestFailure("Native doctest operation failed or did not execute exactly once");
    if (operationException) std::rethrow_exception(operationException);
    return operationResult;
}
void assertionControl(bool passes)
{
    if (passes) { LUAU_ASSERT(true); }
    else { LUAU_ASSERT(false); }
}
void doctestControl(bool passes)
{
    // A real nonfatal upstream-style CHECK must fail the enclosing operation
    // even when its callback returns normally. Never infer this from logging.
    CHECK(passes);
}
bool assertionHandlerRestored() { return activeOperation == nullptr && Luau::assertHandler() == nullptr; }
}
