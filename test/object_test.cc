#include "djs.hpp"
#include <catch2/catch_test_macros.hpp>

using namespace djs;
TEST_CASE("Object.DefineOwnProperty") {
  auto vm = VM();
  auto *obj = vm.MakeBasicObject().as_object();

  auto key_foo = PropertyKey(vm.make_string("foo"));
  auto completion = obj->DefineOwnProperty(&vm, key_foo,
                                           PropertyDescriptor{
                                               .get = std::nullopt,
                                               .set = std::nullopt,
                                               .value = vm.make_string("bar"),
                                               .writable = false,
                                           });
  REQUIRE(completion.kind() == CompletionKind::Normal);
  REQUIRE(completion.value_or_panic());

  auto descriptor_opt = obj->GetOwnProperty(&vm, key_foo).value_or_panic();
  REQUIRE(descriptor_opt.has_value());
  auto descriptor = *descriptor_opt;

  REQUIRE(descriptor.value.has_value());
  auto value = *descriptor.value;

  REQUIRE(value.as_string()->text() == "bar");
}
