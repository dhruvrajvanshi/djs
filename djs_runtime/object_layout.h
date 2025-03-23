#pragma once
#include <assert.h>
#include "./completion.h"
#include "./object.h"
#include "./value.h"

typedef struct DJSRuntime DJSRuntime;

typedef struct DJSDataProperty {
  DJSValue value;
} DJSDataProperty;

typedef struct DJSAccessorProperty {
  DJSObject* get;
  DJSObject* set;
} DJSAccessorProperty;

typedef struct DJSObjectVTable {
  DJSCompletion (*GetOwnProperty)(DJSRuntime*,
                                  DJSObject* self,
                                  DJSPropertyKey key);
  DJSCompletion (*DefineOwnProperty)(DJSRuntime*,
                                     DJSObject* self,
                                     DJSPropertyKey key,
                                     DJSProperty* descriptor);
  DJSCompletion (*IsExtensible)(DJSRuntime*, DJSObject*);
  DJSCompletion (*Call)(DJSRuntime*,
                        DJSObject* f,
                        DJSValue this,
                        DJSValue* args,
                        size_t argc);
} DJSObjectVTable;

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSProperty* descriptor;
  struct DJSObjectEntry* next;
} DJSObjectEntry;

typedef struct DJSObject {
  DJSObjectEntry* properties;
  bool is_extensible;
  const DJSObjectVTable* vtable;
} DJSObject;

#define FOR_EACH_ENTRY(obj, entry) \
  for (DJSObjectEntry* entry = obj->properties; entry; entry = entry->next)

typedef struct DJSProperty {
  DJSObject object;
  DJSPropertyFlags flags;
  union {
    DJSDataProperty data;
    DJSAccessorProperty accessor;
  } as;
} DJSProperty;

static void DJSObject_init(DJSObject* self, const DJSObjectVTable* vtable) {
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

static const DJSObjectVTable DJSOrdinaryObjectVTable = {
    .GetOwnProperty = OrdinaryGetOwnProperty,
    .DefineOwnProperty = OrdinaryDefineOwnProperty,
    .IsExtensible = OrdinaryIsExtensible,
    .Call = NULL,
};
