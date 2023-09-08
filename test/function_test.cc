#include "djs.hpp"
#include <gtest/gtest.h>

using namespace djs;
TEST(Function, CallingNoArgFunction) {
  auto vm = VM();
  auto fn = vm.make_function().as_object<Function>();

  using I = Instruction;
  fn->local_count = 1;
  fn->basic_blocks.push_back(BasicBlock{
      .instructions = {I::LoadValue(0, Value::boolean(true)), I::Return(0)}});

  auto result = fn->Call(&vm, Value::null(), vm.make_array());

  EXPECT_TRUE(result.as_boolean());
}
