#include <catch2/catch_test_macros.hpp>
#include "djs/Value.hpp"

TEST_CASE( "Smoke test", "[smoke test]" ) {
    REQUIRE( 1 == 1 );
}
using namespace djs;
TEST_CASE("Value::undefined()") {
    REQUIRE(Value::undefined().is_undefined());
}
