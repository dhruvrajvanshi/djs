#pragma once
#include "./value.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

typedef struct DJSObjectEntry DJSObjectEntry;
typedef struct DJSRuntime DJSRuntime;

typedef struct DJSPropertyKey {
  enum {
    DJS_PROPERTY_KEY_STRING = 0,
    DJS_PROPERTY_KEY_SYMBOL = 1,
  } type;
  union {
    DJSString string;
    DJSSymbol symbol;
  } as;
} DJSPropertyKey;

typedef struct DJSObject {
  DJSObjectEntry *properties;
} DJSObject;

typedef struct DJSDataProperty {
  DJSValue value;
} DJSDataProperty;

typedef struct DJSAccessorProperty {
  DJSObject *get;
  DJSObject *set;
} DJSAccessorProperty;

typedef uint8_t DJSPropertyFlags;
typedef struct DJSPropertyDescriptor {
  DJSPropertyFlags flags;
  union {
    DJSDataProperty data;
    DJSAccessorProperty accessor;
  } as;
} DJSPropertyDescriptor;

MK_OPT(OptPropertyDescriptor, DJSPropertyDescriptor);

static const DJSPropertyFlags DJS_PROPERTY_WRITABLE = 1 << 0;
static const DJSPropertyFlags DJS_PROPERTY_ENUMERABLE = 1 << 1;
static const DJSPropertyFlags DJS_PROPERTY_CONFIGURABLE = 1 << 2;
static const DJSPropertyFlags DJS_PROPERTY_TYPE_MASK = 1 << 3;

static inline bool DJSProperty_is_writable(DJSPropertyDescriptor descriptor) {
  return descriptor.flags & DJS_PROPERTY_WRITABLE;
}
static inline bool DJSPRoperty_is_enumerable(DJSPropertyDescriptor descriptor) {
  return descriptor.flags & DJS_PROPERTY_ENUMERABLE;
}
static inline bool
DJSProperty_is_configurable(DJSPropertyDescriptor descriptor) {
  return descriptor.flags & DJS_PROPERTY_CONFIGURABLE;
}
static inline bool DJSProperty_is_accessor(DJSPropertyDescriptor descriptor) {
  return descriptor.flags & DJS_PROPERTY_TYPE_MASK;
}
static inline bool DJSProperty_is_data(DJSPropertyDescriptor descriptor) {
  return !DJSProperty_is_accessor(descriptor);
}

static inline DJSValue DJSProperty_value(DJSPropertyDescriptor descriptor) {
  assert(DJSProperty_is_data(descriptor));
  return descriptor.as.data.value;
}

static DJSPropertyDescriptor __attribute__((unused))
DJSProperty_data(DJSValue value, DJSPropertyFlags flags) {
  assert(!(flags & DJS_PROPERTY_TYPE_MASK) &&
         "Property type should not be set");
  return (DJSPropertyDescriptor){.flags = flags,
                                 .as = {.data = {.value = value}}};
}

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSPropertyDescriptor descriptor;
  DJSObjectEntry *next;
} DJSObjectEntry;

static inline bool DJSPropertyKey_eq(DJSPropertyKey left,
                                     DJSPropertyKey right) {
  if (left.type != right.type) {
    return false;
  }
  switch (left.type) {
  case DJS_PROPERTY_KEY_STRING:
    return DJSString_eq(left.as.string, right.as.string);
  case DJS_PROPERTY_KEY_SYMBOL:
    return DJSSymbol_eq(left.as.symbol, right.as.symbol);
  }
}

static inline DJSPropertyKey DJSPropertyKey_string(DJSString string) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_STRING,
                          .as = {.string = string}};
}

static inline DJSPropertyKey DJSPropertyKey_symbol(DJSSymbol symbol) {
  return (DJSPropertyKey){.type = DJS_PROPERTY_KEY_SYMBOL,
                          .as = {.symbol = symbol}};
}

static inline DJSValue DJSObject_as_value(DJSObject *object) {
  return (DJSValue){.type = DJS_TYPE_OBJECT, .as = {.object = object}};
}

DJSObject *DJS_MakeBasicObject(DJSRuntime *runtime);

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
OptPropertyDescriptor DJS_OrdinaryGetOwnProperty(DJSObject *obj,
                                                 DJSPropertyKey);
