#include "djs.hpp"
#include <gtest/gtest.h>

using namespace djs;
TEST(VM, make_array) {
  auto vm = VM();
  auto arr = vm.make_array().as_object<Array>();
  ASSERT_NE(dynamic_cast<Array *>(arr), nullptr);
}
