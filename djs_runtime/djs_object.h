#pragma once

#include "./djs.h"

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
  DJSCompletion (*SetPrototypeOf)(DJSRuntime*,
                                  DJSObject* self,
                                  DJSObject* proto);
  DJSCompletion (*GetPrototypeOf)(DJSRuntime*, DJSObject* self);
  DJSCompletion (*Get)(DJSRuntime*,
                       DJSObject* O,
                       DJSPropertyKey P,
                       DJSValue receiver);
} DJSObjectVTable;

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSProperty* descriptor;
  struct DJSObjectEntry* next;
} DJSObjectEntry;

typedef struct DJSObject {
  DJSObject* NULLABLE prototype;
  DJSObjectEntry* properties;
  bool is_extensible;
  const DJSObjectVTable* vtable;
} DJSObject;
