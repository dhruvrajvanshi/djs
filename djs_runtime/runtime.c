#include "runtime.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct DJSRuntime {
} DJSRuntime;

void DJSString_print(FILE *file, const DJSString *str) {
  for (size_t i = 0; i < str->length; i++) {
    fputc(str->value[i], file);
  }
}

void DJSValue_print(FILE *file, const DJSValue *value) {
  switch (value->type) {
  case DJS_TYPE_UNDEFINED:
    fprintf(file, "undefined");
    break;
  case DJS_TYPE_NULL:
    fprintf(file, "null");
    break;
  case DJS_TYPE_BOOLEAN:
    if (value->as.boolean) {
      fprintf(file, "true");
    } else {
      fprintf(file, "false");
    }
    break;
  case DJS_TYPE_NUMBER:
    fprintf(file, "%f", value->as.number);
    break;
  case DJS_TYPE_OBJECT:
    switch (value->as.object->type) {
    case DJS_OBJECT_STRING:
      DJSString_print(file, (DJSString *)(value->as.object));
      break;
    default:
      fprintf(file, "[object: Object]");
    }
    break;
  }
}

DJSRuntime *djs_new_runtime() {
  DJSRuntime *runtime = malloc(sizeof(DJSRuntime));
  return runtime;
}
void djs_free_runtime(DJSRuntime *runtime) { free(runtime); }

DJSInstance *djs_new_instance(DJSRuntime *UNUSED(runtime)) {
  DJSInstance *instance = malloc(sizeof(DJSObject));
  instance->obj = (DJSObject){.type = DJS_OBJECT_INSTANCE, .properties = NULL};
  return instance;
}

DJSString *djs_new_string(DJSRuntime *UNUSED(runtime), const char *value) {
  DJSString *string = malloc(sizeof(DJSString));
  string->obj = (DJSObject){.type = DJS_OBJECT_STRING, .properties = NULL};
  string->value = strdup(value);
  string->length = strlen(value);
  return string;
}

static const DJSValue DJS_UNDEFINED = {.type = DJS_TYPE_UNDEFINED,
                                       .as = {.undefined = true}};

#define DJS_KEY_EQ(left, right)                                                \
  djs_key_eq((DJSObject *)left, (DJSObject *)right)

bool djs_string_eq(DJSString *left, DJSString *right) {
  if (left->length != right->length) {
    return false;
  }
  return memcmp(left->value, right->value, left->length) == 0;
}

bool djs_key_eq(DJSObject *left, DJSObject *right) {
  if (left->type != right->type) {
    return false;
  }
  switch (left->type) {
  case DJS_OBJECT_STRING: {
    DJSString *left_str = (DJSString *)left;
    DJSString *right_str = (DJSString *)right;
    return djs_string_eq(left_str, right_str);
  }
  default:
    return false;
  }
}

DJSObject *djs_string_as_obj(DJSString *string) { return (DJSObject *)string; }

DJSCompletion djs_object_get(DJSRuntime *UNUSED(runtime), DJSObject *object,
                             DJSString *key) {
  DJSCompletion completion = {.value = DJS_UNDEFINED, .abrupt = false};
  DJSObjectEntry *current_entry = object->properties;
  while (current_entry != NULL) {
    if (djs_key_eq(current_entry->key, djs_string_as_obj(key))) {
      return (DJSCompletion){.value = current_entry->value, .abrupt = false};
    };
    current_entry = current_entry->next;
  }
  return completion;
}

DJSCompletion djs_object_set(DJSRuntime *UNUSED(runtime), DJSObject *object,
                             DJSString *key, DJSValue value) {

  if (object->properties == NULL) {
    object->properties = malloc(sizeof(DJSObjectEntry));
    object->properties->key = (DJSObject *)key;
    object->properties->value = value;
  } else {
    DJS_TODO();
  }

  return (DJSCompletion){.value = DJS_UNDEFINED, .abrupt = false};
}

void djs_console_log(__attribute__((unused)) DJSRuntime *runtime,
                     DJSValue value) {
  DJSValue_print(stdout, &value);
  puts("");
}

bool djs_eqeqeq(DJSValue left, DJSValue right) {
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
    if (left.as.object->type != right.as.object->type) {
      return false;
    }
    if (left.as.object->type == DJS_OBJECT_STRING) {
      return djs_string_eq((DJSString *)(left.as.object),
                           (DJSString *)(right.as.object));
    }
  default:
    DJS_PANIC("Unknown value type");
  }
}
