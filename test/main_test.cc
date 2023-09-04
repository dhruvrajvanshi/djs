#include <catch2/catch_test_macros.hpp>
#include "djs/Value.hpp"

using namespace djs;

TEST_CASE("Value::undefined()") {
    REQUIRE(Value::undefined().is_undefined());
}
