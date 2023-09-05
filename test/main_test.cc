#include "djs/CompletionRecord.hpp"
#include "djs/Function.hpp"
#include "djs/Instruction.hpp"
#include "djs/VM.hpp"
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
  REQUIRE(bc.arg0.as<RegisterIndex>() == 1);
  REQUIRE(bc.arg1.as<Value>().is_null());
}

TEST_CASE("VM::execute(const Function&)") {
  using I = Instruction;
  auto bb = BasicBlock{{I::LoadValue(0, Value::null()), I::Return(0)}};
  auto fn = Function{{bb}, 1};

  auto vm = VM();

  auto result = vm.execute(fn);

  REQUIRE(result.value_or_panic().is_null());
}
