#include "./object.h"
#include "./prelude.h"
#include "gc.h"
#include "property.h"
#include <assert.h>

void DJSObject_init(DJSObject *self) { self->properties = NULL; }

DJSObject *DJS_MakeBasicObject(DJSRuntime *UNUSED(runtime)) {
  DJSObject *obj = GC_malloc(sizeof(DJSObject));
  DJSObject_init(obj);
  return obj;
}

#define FOR_EACH_ENTRY(obj, entry, block)                                      \
  {                                                                            \
    DJSObjectEntry *entry = obj->properties;                                   \
    while (entry) {                                                            \
      block;                                                                   \
      entry = entry->next;                                                     \
    }                                                                          \
  }

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
OptDJSProperty DJS_OrdinaryGetOwnProperty(DJSObject *obj, DJSPropertyKey key) {
  FOR_EACH_ENTRY(obj, entry, {
    if (DJSPropertyKey_eq(entry->key, key)) {
      DJSProperty descriptor = entry->descriptor;
      if (!DJSProperty_is_data(descriptor)) {
        assert(DJSProperty_is_accessor(descriptor));
      }
      return OptDJSProperty_of(descriptor);
    };
  });
  return OptDJSProperty_empty();
}
