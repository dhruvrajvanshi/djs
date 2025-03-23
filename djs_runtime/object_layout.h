#pragma once
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
