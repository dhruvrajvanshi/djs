#include "./object.h"
#include <assert.h>
#include <gc.h>
#include "./completion.h"
#include "./prelude.h"
#include "./value.h"

typedef struct DJSDataProperty {
  DJSValue value;
} DJSDataProperty;

typedef struct DJSAccessorProperty {
  DJSObject* get;
  DJSObject* set;
} DJSAccessorProperty;

typedef struct DJSProperty {
  DJSObject* object;
  DJSPropertyFlags flags;
  union {
    DJSDataProperty data;
    DJSAccessorProperty accessor;
  } as;
} DJSProperty;

MK_OPT(OptDJSProperty, DJSProperty);

static inline bool DJSProperty_is_writable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_WRITABLE;
}
static inline bool DJSProperty_is_enumerable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_ENUMERABLE;
}
static inline bool DJSProperty_is_configurable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_CONFIGURABLE;
}
static inline bool DJSProperty_is_accessor(DJSProperty property) {
  return property.flags & DJS_PROPERTY_TYPE_MASK;
}
static inline bool DJSProperty_is_data(DJSProperty property) {
  return !DJSProperty_is_accessor(property);
}
static inline DJSValue DJSProperty_as_value(DJSProperty* property) {
  return DJSValue_object((DJSObject*)property);
}
DJSProperty* DJSProperty_new_data_property(DJSRuntime* UNUSED(runtime),
                                           DJSValue value,
                                           DJSPropertyFlags flags) {
  DJSProperty* result = GC_MALLOC(sizeof(DJSProperty));
  result->flags = flags | (DJS_PROPERTY_TYPE_MASK & 0);
  result->as.data.value = value;
  return result;
}

static inline DJSValue DJSProperty_value(DJSProperty property) {
  assert(DJSProperty_is_data(property));
  return property.as.data.value;
}

static DJSProperty __attribute__((unused))
DJSProperty_data(DJSValue value, DJSPropertyFlags flags) {
  assert(!(flags & DJS_PROPERTY_TYPE_MASK) &&
         "Property type should not be set");
  return (DJSProperty){.flags = flags, .as = {.data = {.value = value}}};
}

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
    default:
      return false;
  }
}

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

static const DJSObjectVTable DJSOrdinaryObjectVTable;

typedef struct DJSObjectEntry DJSObjectEntry;

typedef struct DJSObject {
  DJSObjectEntry* properties;
  bool is_extensible;
  const DJSObjectVTable* vtable;
} DJSObject;

typedef struct DJSObjectEntry {
  DJSPropertyKey key;
  DJSProperty* descriptor;
  DJSObjectEntry* next;
} DJSObjectEntry;

void DJSObject_init(DJSObject* self, const DJSObjectVTable* vtable) {
  *self = (DJSObject){0};
  self->properties = NULL;
  self->vtable = vtable;
  self->is_extensible = false;
}

DJSObject* DJS_MakeBasicObject(DJSRuntime* UNUSED(runtime)) {
  DJSObject* obj = GC_malloc(sizeof(DJSObject));
  DJSObject_init(obj, &DJSOrdinaryObjectVTable);
  return obj;
}

#define FOR_EACH_ENTRY(obj, entry) \
  for (DJSObjectEntry* entry = obj->properties; entry; entry = entry->next)

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
DJSCompletion OrdinaryGetOwnProperty(DJSRuntime* UNUSED(runtime),
                                     DJSObject* obj,
                                     DJSPropertyKey key) {
  FOR_EACH_ENTRY(obj, entry) {
    if (DJSPropertyKey_eq(entry->key, key)) {
      DJSProperty* descriptor = entry->descriptor;
      if (!DJSProperty_is_data(*descriptor)) {
        assert(DJSProperty_is_accessor(*descriptor));
      }
      return DJSCompletion_normal(DJSProperty_as_value(descriptor));
    };
  }
  return DJSCompletion_normal(DJSValue_undefined());
}

/// https://tc39.es/ecma262/#sec-ordinarydefineownproperty
DJSCompletion OrdinaryDefineOwnProperty(DJSRuntime* runtime,
                                        DJSObject* self,
                                        DJSPropertyKey key,
                                        DJSProperty* descriptor) {
  DJSValue obj;
  DJS_COMPLETION_SET(obj, DJSObject_GetOwnProperty(runtime, self, key));

  DJSValue extensible;
  DJS_COMPLETION_SET(extensible, DJSObject_IsExtensible(runtime, self));

  DJS_TODO();
}

DJSCompletion OrdinaryIsExtensible(DJSRuntime* UNUSED(runtime),
                                   DJSObject* obj) {
  return DJSCompletion_normal(DJSValue_bool(obj->is_extensible));
}

static const DJSObjectVTable DJSOrdinaryObjectVTable = {
    .GetOwnProperty = OrdinaryGetOwnProperty,
    .DefineOwnProperty = OrdinaryDefineOwnProperty,
    .IsExtensible = OrdinaryIsExtensible,
};

DJSCompletion DJSObject_IsExtensible(DJSRuntime* runtime, DJSObject* obj) {
  return obj->vtable->IsExtensible(runtime, obj);
}

DJSCompletion DJSObject_GetOwnProperty(DJSRuntime* runtime,
                                       DJSObject* obj,
                                       DJSPropertyKey key) {
  return obj->vtable->GetOwnProperty(runtime, obj, key);
}

DJSCompletion DJSObject_DefineOwnProperty(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key,
                                          DJSProperty* descriptor) {
  return obj->vtable->DefineOwnProperty(runtime, obj, key, descriptor);
}

DJSCompletion DJSObject_CreateDataProperty(DJSRuntime* runtime,
                                           DJSObject* obj,
                                           DJSPropertyKey key,
                                           DJSValue value) {
  DJSProperty* descriptor = DJSProperty_new_data_property(
      runtime, value,
      DJS_PROPERTY_WRITABLE | DJS_PROPERTY_ENUMERABLE |
          DJS_PROPERTY_CONFIGURABLE);
  return obj->vtable->DefineOwnProperty(runtime, obj, key, descriptor);
}

DJSCompletion DJSObject_HasOwnProperty(DJSRuntime* runtime,
                                       DJSObject* obj,
                                       DJSPropertyKey key) {
  DJSValue own_property;
  DJS_COMPLETION_SET(own_property, DJSObject_GetOwnProperty(runtime, obj, key));
  if (DJSValue_is_undefined(own_property)) {
    return DJSCompletion_normal(DJSValue_bool(false));
  } else {
    return DJSCompletion_normal(DJSValue_bool(true));
  }
}
