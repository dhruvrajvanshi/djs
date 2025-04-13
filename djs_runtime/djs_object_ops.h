#pragma once
#include <assert.h>
#include <stdint.h>
#include "./djs.h"
#include "./djs_property.h"

#define FOR_EACH_ENTRY(obj, entry) \
  for (DJSObjectEntry* entry = obj->properties; entry; entry = entry->next)

static inline void DJSObject_init(DJSObject* self,
                                  const DJSObjectVTable* vtable) {
  assert(self != NULL);
  *self = (DJSObject){0};
  self->properties = NULL;
  self->vtable = vtable;
  self->is_extensible = true;
}

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
DJSCompletion OrdinaryGetOwnProperty(DJSRuntime* runtime,
                                     DJSObject* obj,
                                     DJSPropertyKey key);

/// https://tc39.es/ecma262/#sec-ordinarydefineownproperty
DJSCompletion OrdinaryDefineOwnProperty(DJSRuntime* runtime,
                                        DJSObject* self,
                                        DJSPropertyKey key,
                                        DJSProperty* descriptor);

DJSCompletion OrdinaryIsExtensible(DJSRuntime* runtime, DJSObject* obj);
DJSCompletion OrdinarySetPrototypeOf(DJSRuntime* runtime,
                                     DJSObject* obj,
                                     DJSObject* proto);

DJSCompletion OrdinaryGetPrototypeOf(DJSRuntime* runtime, DJSObject* obj);
DJSCompletion OrdinaryGet(DJSRuntime* runtime,
                          DJSObject* O,
                          DJSPropertyKey key,
                          DJSValue receiver);

static const DJSObjectVTable DJSOrdinaryObjectVTable = {
    .GetOwnProperty = OrdinaryGetOwnProperty,
    .DefineOwnProperty = OrdinaryDefineOwnProperty,
    .IsExtensible = OrdinaryIsExtensible,
    .Call = NULL,
    .SetPrototypeOf = OrdinarySetPrototypeOf,
    .GetPrototypeOf = OrdinaryGetPrototypeOf,
    .Get = OrdinaryGet,
};
