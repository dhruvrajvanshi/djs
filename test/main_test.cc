#include "djs/CompletionRecord.hpp"
#include "djs/Function.hpp"
#include "djs/Instruction.hpp"
#include "djs/String.hpp"
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
  Value::native_function([](auto &, auto) -> auto {
    return CompletionRecord::normal(Value::undefined());
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

TEST_CASE("VM::MakeBasicObject()") {
  auto vm = VM{};
  REQUIRE(vm.MakeBasicObject().is_object());
}

TEST_CASE("Value::string()") {
  String s = String(std::string("foo"));
  auto value = Value::string(&s);
  REQUIRE(value.is_string());
  REQUIRE(value.as_string() == &s);
  REQUIRE(value.as_string()->contents == "foo");
}
