#pragma once
#include <stdint.h>
#include "./djs.h"
#include "./djs_object.h"
#include "./djs_string.h"

typedef uint8_t DJSPropertyFlags;
static const DJSPropertyFlags DJS_PROPERTY_WRITABLE = 1 << 0;
static const DJSPropertyFlags DJS_PROPERTY_ENUMERABLE = 1 << 1;
static const DJSPropertyFlags DJS_PROPERTY_CONFIGURABLE = 1 << 2;
static const DJSPropertyFlags DJS_PROPERTY_TYPE_MASK = 1 << 3;

typedef struct DJSDataProperty {
  DJSValue value;
} DJSDataProperty;

typedef struct DJSAccessorProperty {
  DJSFunction* NULLABLE get;
  DJSFunction* NULLABLE set;
} DJSAccessorProperty;

typedef struct DJSProperty {
  DJSObject object;
  DJSPropertyFlags flags;
  union {
    DJSDataProperty data;
    DJSAccessorProperty accessor;
  } as;
} DJSProperty;

static inline bool djs_property_is_configurable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_CONFIGURABLE;
}

static inline void djs_property_set_configurable(DJSProperty* property,
                                                 bool configurable) {
  if (configurable) {
    property->flags |= DJS_PROPERTY_CONFIGURABLE;
  } else {
    property->flags &= ~DJS_PROPERTY_CONFIGURABLE;
  }
}

static inline void djs_property_set_enumerable(DJSProperty* property,
                                               bool enumerable) {
  if (enumerable) {
    property->flags |= DJS_PROPERTY_ENUMERABLE;
  } else {
    property->flags &= ~DJS_PROPERTY_ENUMERABLE;
  }
}

static inline void djs_property_set_writable(DJSProperty* property,
                                             bool writable) {
  if (writable) {
    property->flags |= DJS_PROPERTY_WRITABLE;
  } else {
    property->flags &= ~DJS_PROPERTY_WRITABLE;
  }
}

MK_OPT(OptDJSProperty, DJSProperty)

static inline bool property_key_eq(DJSPropertyKey left, DJSPropertyKey right) {
  if (left.type != right.type) {
    return false;
  }
  switch (left.type) {
    case DJS_PROPERTY_KEY_STRING:
      return djs_string_eq(left.as.string, right.as.string);
    case DJS_PROPERTY_KEY_SYMBOL:
      return left.as.symbol.id == right.as.symbol.id;
    default:
      return false;
  }
}
