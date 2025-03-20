#pragma once
#include "./property.h"
#include "./value.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

typedef struct DJSObjectEntry DJSObjectEntry;
typedef struct DJSRuntime DJSRuntime;

typedef struct DJSObject {
  DJSObjectEntry *properties;
} DJSObject;

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSProperty descriptor;
  DJSObjectEntry *next;
} DJSObjectEntry;

static inline DJSValue DJSObject_as_value(DJSObject *object) {
  return (DJSValue){.type = DJS_TYPE_OBJECT, .as = {.object = object}};
}

DJSObject *DJS_MakeBasicObject(DJSRuntime *runtime);

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
OptDJSProperty DJS_OrdinaryGetOwnProperty(DJSObject *obj, DJSPropertyKey);
