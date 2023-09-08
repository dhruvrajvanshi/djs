#include "djs/Completion.hpp"
#include "djs/Function.hpp"
#include "djs/Instruction.hpp"
#include "djs/Object.hpp"
#include "djs/String.hpp"
#include "djs/VM.hpp"
#include "djs/Value.hpp"
#include <gtest/gtest.h>

using namespace djs;
#define REQUIRE(x) ASSERT_TRUE(x)

TEST(Value, CanCreateUndefined) { REQUIRE(Value::undefined().is_undefined()); }

TEST(Value, CanCreateNull) {
  REQUIRE(Value::null().is_null());
  REQUIRE(!Value::null().is_undefined());
}

TEST(Value, CanCreateNativeFunction) {
  Value::native_function([](auto &, auto) -> auto {
    return ValueCompletionRecord::normal(Value::undefined());
  });
}

TEST(Instruction, CanCreateLoadValueInstruction) {
  auto bc = Instruction::LoadValue(1, Value::null());
  REQUIRE(bc.arg0.as<RegisterIndex>() == 1);
  REQUIRE(bc.arg1.as<Value>().is_null());
}

TEST(VM, CanExecuteFunctionInstance) {
  using I = Instruction;
  auto bb = BasicBlock{{I::LoadValue(0, Value::null()), I::Return(0)}};
  auto fn = Function{{bb}, 1};

  auto vm = VM();

  auto result = vm.execute(fn);

  REQUIRE(result.value_or_panic().is_null());
}

TEST(VM, CanCreateBasicObject) {
  auto vm = VM{};
  REQUIRE(vm.MakeBasicObject().is_object());
}

TEST(Value, CanCreateString) {
  String s = String(std::string("foo"));
  auto value = Value::string(&s);
  REQUIRE(value.is_string());
  REQUIRE(value.as_string() == &s);
  REQUIRE(value.as_string()->text() == "foo");
}

TEST(GetOwnProperty, ReturnsNullWhenPropertyDoesntExist) {
  auto vm = VM{};
  auto obj = vm.MakeBasicObject().as_object<Object>();
  auto &slots = obj->slots;
  auto completion =
      slots.GetOwnProperty(&vm, obj, PropertyKey(vm.make_string("foo")));

  ASSERT_FALSE(completion.value_or_panic().has_value());
}
