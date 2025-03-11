#include "./runtime.h"
#include "./print.h"
#include <gc.h>

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

DJSInstance *djs_new_instance(DJSRuntime *UNUSED(runtime)) {
  DJSInstance *instance = GC_malloc(sizeof(DJSObject));
  instance->obj = (DJSObject){.type = DJS_OBJECT_INSTANCE, .properties = NULL};
  return instance;
}

DJSString *djs_new_string(DJSRuntime *UNUSED(runtime), const char *value) {
  DJSString *string = GC_malloc(sizeof(DJSString));
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

DJSObjectEntry *DJSObject_get_own_entry(DJSObject *self, DJSString *key) {
  DJSObjectEntry *current = self->properties;
  while (current) {
    if (djs_eqeqeq(DJS_OBJECT_AS_VALUE(key),
                   DJS_OBJECT_AS_VALUE(current->key))) {
      return current;
    } else {
      current = current->next;
    }
  }
  return NULL;
}

DJSCompletion djs_object_get(DJSRuntime *UNUSED(runtime), DJSObject *object,
                             DJSString *key) {
  DJSObjectEntry *entry = DJSObject_get_own_entry(object, key);
  if (entry == NULL) {
    return (DJSCompletion){.abrupt = false, .value = DJS_UNDEFINED};
  }
  return (DJSCompletion){.abrupt = false, .value = entry->value};
}

DJSCompletion djs_object_set(DJSRuntime *UNUSED(runtime), DJSObject *object,
                             DJSString *key, DJSValue value) {

  DJSObjectEntry *existing = DJSObject_get_own_entry(object, key);

  if (!existing) {
    object->properties = GC_malloc(sizeof(DJSObjectEntry));
    object->properties->key = (DJSObject *)key;
    object->properties->value = value;
    object->properties->next = NULL;
  } else {
    DJSObjectEntry *new_entry = GC_malloc(sizeof(DJSObjectEntry));
    new_entry->next = object->properties;
    new_entry->key = (DJSObject *)key;
    new_entry->value = value;
    object->properties = new_entry;
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
