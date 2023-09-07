#include "djs.hpp"
#include <catch2/catch_test_macros.hpp>

using namespace djs;
TEST_CASE("Array creation") {
  auto vm = VM();
  auto arr = vm.make_array().as_object();
  REQUIRE(dynamic_cast<Array *>(arr) != nullptr);
}
