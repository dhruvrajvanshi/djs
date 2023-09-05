#include "djs/Bytecode.hpp"
#include "djs/CompletionRecord.hpp"
#include "djs/Value.hpp"
#include <catch2/catch_test_macros.hpp>

using namespace djs;

TEST_CASE("Value::undefined()") { REQUIRE(Value::undefined().is_undefined()); }

TEST_CASE("Value::null()") {
  REQUIRE(Value::null().is_null());
  REQUIRE(!Value::null().is_undefined());
}

TEST_CASE("Value::native_function()") {
  auto f = Value::native_function(
      [](VM &, std::span<Value> args) -> CompletionRecord {
        return {CompletionRecord::normal(Value::undefined())};
      });
}

TEST_CASE("Instruction::LoadValue()") {
  auto bc = Instruction::LoadValue(1, Value::null());
  REQUIRE(bc.destination == 1);
  REQUIRE(bc.arg1.as<Value>().is_null());
}
