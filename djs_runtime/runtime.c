#include "./runtime.h"
#include "./prelude.h"
#include "./print.h"
#include "object.h"
#include "value.h"
#include <gc.h>

#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct DJSRuntime {
} DJSRuntime;

DJSRuntime *djs_new_runtime() {
  GC_init();
  DJSRuntime *runtime = malloc(sizeof(DJSRuntime));
  return runtime;
}
void djs_free_runtime(DJSRuntime *runtime) { free(runtime); }

DJSString *djs_new_string(DJSRuntime *UNUSED(runtime), const char *value) {
  DJSString *string = GC_malloc(sizeof(DJSString));
  size_t length = strlen(value);
  char *buffer = GC_malloc_atomic(length);
  memcpy(buffer, value, length);

  string->length = length;
  string->value = buffer;
  return string;
}

static const DJSValue DJS_UNDEFINED = {.type = DJS_TYPE_UNDEFINED,
                                       .as = {.undefined = true}};

DJSCompletion djs_object_get(DJSRuntime *UNUSED(runtime), DJSObject *object,
                             DJSString *key) {
  OptPropertyDescriptor opt_descriptor =
      DJS_OrdinaryGetOwnProperty(object, DJSPropertyKey_string(*key));

  if (opt_descriptor.is_present) {
    if (DJSProperty_is_accessor(opt_descriptor.value)) {
      DJS_TODO();
    } else {
      assert(DJSProperty_is_data(opt_descriptor.value));
      return DJSCompletion_normal(DJSProperty_value(opt_descriptor.value));
    }
  } else {
    return DJSCompletion_normal(DJS_UNDEFINED);
  }
}

DJSCompletion djs_object_set(DJSRuntime *UNUSED(runtime), DJSObject *object,
                             DJSString *key, DJSValue value) {

  OptPropertyDescriptor existing =
      DJS_OrdinaryGetOwnProperty(object, DJSPropertyKey_string(*key));

  if (!existing.is_present) {
    object->properties = GC_malloc(sizeof(DJSObjectEntry));
    object->properties->key = DJSPropertyKey_string(*key);
    object->properties->descriptor =
        DJSProperty_data(value, DJS_PROPERTY_WRITABLE);
    object->properties->next = NULL;
  } else {
    DJSObjectEntry *new_entry = GC_malloc(sizeof(DJSObjectEntry));
    new_entry->next = object->properties;
    new_entry->key = DJSPropertyKey_string(*key);
    new_entry->descriptor = DJSProperty_data(value, DJS_PROPERTY_WRITABLE);
    object->properties = new_entry;
  }

  return (DJSCompletion){.value = DJS_UNDEFINED, .abrupt = false};
}

void djs_console_log(__attribute__((unused)) DJSRuntime *runtime,
                     DJSValue value) {
  DJSValue_print(stdout, value);
  puts("");
}

bool DJS_IsStrictlyEqual(DJSValue left, DJSValue right) {
  if (left.type != right.type) {
    return false;
  }
  switch (left.type) {
  case DJS_TYPE_UNDEFINED:
    return true;
  case DJS_TYPE_NULL:
    return true;
  case DJS_TYPE_BOOLEAN:
    return left.as.boolean == right.as.boolean;
  case DJS_TYPE_NUMBER:
    return left.as.number == right.as.number;
  case DJS_TYPE_OBJECT:
    if (left.as.object == right.as.object) {
      return true;
    }
  case DJS_TYPE_STRING:
    return DJSString_eq(*left.as.string, *right.as.string);
  default:
    DJS_PANIC("Unknown value type");
  }
}
