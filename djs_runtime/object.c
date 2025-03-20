#include "./object.h"
#include "./prelude.h"
#include "gc.h"
#include "property.h"
#include <assert.h>

typedef struct DJSObjectVTable {
  OptDJSProperty (*GetOwnProperty)(DJSObject *obj, DJSPropertyKey key);
} DJSObjectVTable;

static const DJSObjectVTable DJSOrdinaryObjectVTable;

typedef struct DJSObject {
  DJSObjectEntry *properties;
  const DJSObjectVTable *vtable;
} DJSObject;

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSProperty descriptor;
  DJSObjectEntry *next;
} DJSObjectEntry;

void DJSObject_init(DJSObject *self, const DJSObjectVTable *vtable) {
  self->properties = NULL;
  self->vtable = vtable;
}

DJSObject *DJS_MakeBasicObject(DJSRuntime *UNUSED(runtime)) {
  DJSObject *obj = GC_malloc(sizeof(DJSObject));
  DJSObject_init(obj, &DJSOrdinaryObjectVTable);
  return obj;
}

#define FOR_EACH_ENTRY(obj, entry)                                             \
  for (DJSObjectEntry *entry = obj->properties; entry; entry = entry->next)

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
OptDJSProperty DJS_OrdinaryGetOwnProperty(DJSObject *obj, DJSPropertyKey key) {
  FOR_EACH_ENTRY(obj, entry) {
    if (DJSPropertyKey_eq(entry->key, key)) {
      DJSProperty descriptor = entry->descriptor;
      if (!DJSProperty_is_data(descriptor)) {
        assert(DJSProperty_is_accessor(descriptor));
      }
      return OptDJSProperty_of(descriptor);
    };
  }
  return OptDJSProperty_empty();
}

static const DJSObjectVTable DJSOrdinaryObjectVTable = {
    .GetOwnProperty = DJS_OrdinaryGetOwnProperty,
};
