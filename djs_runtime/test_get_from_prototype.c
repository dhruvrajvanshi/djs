#include "./test_prelude.h"
#include "djs.h"

int main(void) {
  auto vm = djs_new_runtime();

  auto obj = djs_object_new(vm);
  auto proto = djs_object_new(vm);

  // Object.setPrototypeOf(obj, proto);
  ASSERT_NORMAL(djs_object_set_prototype_of(vm, obj, proto), djs_true());

  auto key = djs_property_key_from(djs_string_new(vm, "key"));
  auto value = djs_value_from(djs_string_new(vm, "value"));

  // proto[key] = value;
  ASSERT_NORMAL(djs_object_define_own_property(
                    vm, proto, key, djs_property_new_data(vm, value)),
                djs_true());
  // assert(obj[key] === "value");

  ASSERT_NORMAL(djs_object_get(vm, obj, key), value);

  ASSERT_NORMAL(djs_object_get(
                    vm, obj, djs_property_key_from(djs_string_new(vm, "key2"))),
                djs_undefined());

  djs_free_runtime(vm);
}
