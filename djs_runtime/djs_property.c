#include "./djs_property.h"
#include <assert.h>
#include <gc.h>
#include "./djs_object_ops.h"

static const DJSObjectVTable DJSPropertyVTable;

static const DJSObjectVTable DJSPropertyVTable = {
    .GetOwnProperty = OrdinaryGetOwnProperty,
    .DefineOwnProperty = OrdinaryDefineOwnProperty,
    .IsExtensible = OrdinaryIsExtensible,
    .Call = NULL,
    .SetPrototypeOf = OrdinarySetPrototypeOf,
    .GetPrototypeOf = OrdinaryGetPrototypeOf,
    .Get = OrdinaryGet,
};

bool djs_property_is_accessor(const DJSProperty* property) {
  return property->flags & DJS_PROPERTY_TYPE_MASK;
}
bool djs_property_is_data(const DJSProperty* property) {
  return !djs_property_is_accessor(property);
}
DJSValue djs_property_as_value(DJSProperty* property) {
  return djs_value_from(&property->object);
}

DJSValue djs_property_value(DJSProperty* property) {
  assert(djs_property_is_data(property));
  return property->as.data.value;
}

/// Returns NULL if the value is not a property.
DJSProperty* djs_property_from_value(DJSValue value) {
  if (value.type != DJS_TYPE_OBJECT) {
    return NULL;
  }
  if (value.as.object->vtable != &DJSPropertyVTable) {
    return NULL;
  }
  return (DJSProperty*)value.as.object;
}
DJSProperty* djs_property_new_data(DJSRuntime* UNUSED(runtime),
                                   DJSValue value) {
  DJSProperty* result = GC_MALLOC(sizeof(DJSProperty));
  result->object.is_extensible = true;
  result->object.vtable = &DJSPropertyVTable;
  result->object.properties = NULL;
  result->flags = (DJS_PROPERTY_TYPE_MASK & 0);
  djs_property_set_configurable(result, true);
  djs_property_set_enumerable(result, true);
  djs_property_set_writable(result, true);
  result->as.data.value = value;
  return result;
}

DJSProperty* djs_property_new_accessor(DJSRuntime* UNUSED(runtime),
                                       DJSFunction* NULLABLE getter,
                                       DJSFunction* NULLABLE setter) {
  DJSProperty* result = GC_MALLOC(sizeof(DJSProperty));
  result->object.is_extensible = true;
  result->object.vtable = &DJSPropertyVTable;
  result->object.properties = NULL;
  result->flags = 0 | DJS_PROPERTY_TYPE_MASK;
  djs_property_set_configurable(result, true);
  djs_property_set_enumerable(result, true);
  djs_property_set_writable(result, true);
  result->as.accessor.get = getter;
  result->as.accessor.set = setter;
  return result;
}

DJSPropertyKey djs_property_key_from_symbol(DJSSymbol symbol) {
  return (DJSPropertyKey){
      .type = DJS_PROPERTY_KEY_SYMBOL,
      .as = {.symbol = symbol},
  };
}
DJSPropertyKey djs_property_key_from_string(const DJSString* string) {
  return (DJSPropertyKey){
      .type = DJS_PROPERTY_KEY_STRING,
      .as = {.string = string},
  };
}
