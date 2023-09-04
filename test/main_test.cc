#include <catch2/catch_test_macros.hpp>
#include "djs/Value.hpp"

using namespace djs;

TEST_CASE("Value::undefined()") {
    REQUIRE(Value::undefined().is_undefined());
}

TEST_CASE("Value::null()") {
    REQUIRE(Value::null().is_null());
    REQUIRE(!Value::null().is_undefined());
}
