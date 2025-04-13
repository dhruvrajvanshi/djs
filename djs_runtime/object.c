#include "./object.h"
#include <assert.h>
#include <gc.h>
#include "./comparison_ops.h"
#include "./completion.h"
#include "./djs.h"
#include "./object_layout.h"
#include "./prelude.h"
#include "./value.h"
#include "gc/gc.h"
#include "runtime.h"

static const DJSObjectVTable DJSOrdinaryObjectVTable;
static const DJSObjectVTable DJSPropertyVTable;

MK_OPT(OptDJSProperty, DJSProperty)

static bool DJSProperty_is_configurable(DJSProperty property) {
  return property.flags & DJS_PROPERTY_CONFIGURABLE;
}
bool DJSProperty_is_accessor(const DJSProperty* property) {
  return property->flags & DJS_PROPERTY_TYPE_MASK;
}
bool DJSProperty_is_data(const DJSProperty* property) {
  return !DJSProperty_is_accessor(property);
}
static inline DJSValue DJSProperty_as_value(DJSProperty* property) {
  return DJSValue_object((DJSObject*)property);
}

DJSValue DJSProperty_value(DJSProperty* property) {
  assert(DJSProperty_is_data(property));
  return property->as.data.value;
}

/// Returns NULL if the value is not a property.
DJSProperty* DJSProperty_from_value(DJSValue value) {
  if (value.type != DJS_TYPE_OBJECT) {
    return NULL;
  }
  if (value.as.object->vtable != &DJSPropertyVTable) {
    return NULL;
  }
  return (DJSProperty*)value.as.object;
}
DJSProperty* DJSProperty_new_data_property(DJSRuntime* UNUSED(runtime),
                                           DJSValue value,
                                           DJSPropertyFlags flags) {
  DJSProperty* result = GC_MALLOC(sizeof(DJSProperty));
  result->object.is_extensible = true;
  result->object.vtable = &DJSPropertyVTable;
  result->object.properties = NULL;
  result->flags = flags | (DJS_PROPERTY_TYPE_MASK & 0);
  result->as.data.value = value;
  return result;
}

DJSProperty* DJSProperty_new_accessor_property(DJSRuntime* UNUSED(runtime),
                                               DJSFunction* NULLABLE getter,
                                               DJSFunction* NULLABLE setter,
                                               DJSPropertyFlags flags) {
  DJSProperty* result = GC_MALLOC(sizeof(DJSProperty));
  result->object.is_extensible = true;
  result->object.vtable = &DJSPropertyVTable;
  result->object.properties = NULL;
  result->flags = flags | DJS_PROPERTY_TYPE_MASK;
  result->as.accessor.get = getter;
  result->as.accessor.set = setter;
  return result;
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
      return DJSString_eq(*left.as.string, *right.as.string);
    case DJS_PROPERTY_KEY_SYMBOL:
      return DJSSymbol_eq(left.as.symbol, right.as.symbol);
    default:
      return false;
  }
}

DJSObject* DJS_MakeBasicObject(DJSRuntime* UNUSED(runtime)) {
  DJSObject* obj = GC_malloc(sizeof(DJSObject));
  DJSObject_init(obj, &DJSOrdinaryObjectVTable);
  return obj;
}

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
DJSCompletion OrdinaryGetOwnProperty(DJSRuntime* UNUSED(runtime),
                                     DJSObject* obj,
                                     DJSPropertyKey key) {
  FOR_EACH_ENTRY(obj, entry) {
    if (DJSPropertyKey_eq(entry->key, key)) {
      DJSProperty* descriptor = entry->descriptor;
      if (!DJSProperty_is_data(descriptor)) {
        assert(DJSProperty_is_accessor(descriptor));
      }
      return DJSCompletion_normal(DJSProperty_as_value(descriptor));
    };
  }
  return DJSCompletion_normal(DJSValue_undefined());
}

bool ValidateAndApplyPropertyDescriptor(DJSObject* O,
                                        const DJSPropertyKey P,
                                        const DJSValue extensible,
                                        const DJSProperty* Desc,
                                        const DJSValue current

) {
  if (DJSValue_is_undefined(current)) {
    if (DJSValue_is_false(extensible)) {
      return false;
    }
    if (O == NULL) {
      return true;
    }
    if (DJSProperty_is_accessor(Desc)) {
      DJSObjectEntry* entry = GC_MALLOC(sizeof(DJSObjectEntry));
      entry->key = P;
      entry->next = O->properties;
      entry->descriptor = GC_MALLOC(sizeof(DJSProperty));
      *entry->descriptor = *Desc;
      O->properties = entry;
      return true;
    } else {
      DJSObjectEntry* entry = GC_MALLOC(sizeof(DJSObjectEntry));
      entry->key = P;
      entry->next = O->properties;
      entry->descriptor = GC_MALLOC(sizeof(DJSProperty));
      *entry->descriptor = *Desc;
      O->properties = entry;
      return true;
    }
  }
  DJSProperty* current_property = DJSProperty_from_value(current);
  assert(current_property);
  if (!DJSProperty_is_configurable(*current_property)) {
    DJS_TODO();
  }
  if (O != NULL) {
    if (DJSProperty_is_data(current_property) &&
        DJSProperty_is_accessor(Desc)) {
      DJS_TODO();
    } else if (DJSProperty_is_accessor(current_property) &&
               DJSProperty_is_data(Desc)) {
      DJS_TODO();
    } else {
      *current_property = *Desc;
    }
  }
  return true;
}

/// https://tc39.es/ecma262/#sec-ordinarydefineownproperty
DJSCompletion OrdinaryDefineOwnProperty(DJSRuntime* runtime,
                                        DJSObject* self,
                                        DJSPropertyKey key,
                                        DJSProperty* descriptor) {
  DJSValue current;
  DJS_COMPLETION_SET(current, DJSObject_GetOwnProperty(runtime, self, key));

  DJSValue extensible;
  DJS_COMPLETION_SET(extensible, DJSObject_IsExtensible(runtime, self));

  bool result = ValidateAndApplyPropertyDescriptor(self, key, extensible,
                                                   descriptor, current);
  return DJSCompletion_normal(DJSValue_bool(result));
}

DJSCompletion OrdinaryIsExtensible(DJSRuntime* UNUSED(runtime),
                                   DJSObject* obj) {
  return DJSCompletion_normal(DJSValue_bool(obj->is_extensible));
}

DJSCompletion OrdinaryGetPrototypeOf(DJSRuntime* UNUSED(runtime),
                                     DJSObject* obj) {
  if (obj->prototype == NULL) {
    return DJSCompletion_normal(DJSValue_null());
  }
  return DJSCompletion_normal(DJSValue_object(obj->prototype));
}

DJSCompletion OrdinarySetPrototypeOf(DJSRuntime* UNUSED(runtime),
                                     DJSObject* O,
                                     DJSObject* NULLABLE V) {
  DJSObject* current = O->prototype;
  if (DJS_SameValueObject(V, current)) {
    return DJSCompletion_true();
  }
  bool extensible = O->is_extensible;
  if (!extensible) {
    return DJSCompletion_false();
  }
  DJSObject* p = V;
  bool done = false;

  while (!done) {
    if (p == NULL) {
      done = true;
      break;
    }
    if (DJS_SameValueObject(O, p)) {
      return DJSCompletion_false();
    }
    if (p->vtable->GetPrototypeOf != OrdinaryGetPrototypeOf) {
      done = true;
      break;
    } else {
      p = p->prototype;
    }
  }
  O->prototype = V;

  return DJSCompletion_true();
}

DJSCompletion OrdinaryGet(DJSRuntime* runtime,
                          DJSObject* O,
                          DJSPropertyKey key,
                          DJSValue receiver) {
  DJSValue desc_value;
  // 1. Let desc be ? O.[[GetOwnProperty]](P).
  DJS_COMPLETION_SET(desc_value, O->vtable->GetOwnProperty(runtime, O, key));
  // 2. If desc is undefined, then
  if (DJSValue_is_undefined(desc_value)) {
    // a. Let parent be ? O.[[GetPrototypeOf]]().
    DJSValue parent_value;
    DJS_COMPLETION_SET(parent_value, O->vtable->GetPrototypeOf(runtime, O));
    // b. If parent is null, return undefined.
    if (DJSValue_is_null(parent_value)) {
      return DJSCompletion_normal(DJSValue_undefined());
    }

    // c. Return ? parent.[[Get]](P, Receiver).
    DJSObject* parent = DJSValue_as_object(parent_value);
    assert(parent ||
           "O->vtable->GetPrototypeOf returned a non-object, non-null value");

    return parent->vtable->Get(runtime, parent, key, receiver);
  }
  DJSProperty* desc = DJSProperty_from_value(desc_value);
  assert(desc ||
         "O->vtable->GetOwnProperty returned a non-descriptor, non undefined "
         "value");
  // 3. If IsDataDescriptor(desc) is true, return desc.[[Value]].
  if (DJSProperty_is_data(desc)) {
    return DJSCompletion_normal(desc->as.data.value);
  }
  assert(DJSProperty_is_accessor(desc));
  DJSFunction* getter = desc->as.accessor.get;
  if (getter == NULL) {
    return DJSCompletion_normal(DJSValue_undefined());
  }
  return DJSObject_Call(
      runtime,
      // cast is safe because DJSFunction has a DJSObject as its first member
      (DJSObject*)getter, receiver, nullptr, 0);
}

static const DJSObjectVTable DJSPropertyVTable = {
    .GetOwnProperty = OrdinaryGetOwnProperty,
    .DefineOwnProperty = OrdinaryDefineOwnProperty,
    .IsExtensible = OrdinaryIsExtensible,
    .Call = NULL,
    .SetPrototypeOf = OrdinarySetPrototypeOf,
    .GetPrototypeOf = OrdinaryGetPrototypeOf,
    .Get = OrdinaryGet,
};

DJSCompletion DJSObject_SetPrototypeOf(DJSRuntime* runtime,
                                       DJSObject* NONNULL obj,
                                       DJSObject* NULLABLE proto) {
  return obj->vtable->SetPrototypeOf(runtime, obj, proto);
}

DJSCompletion DJSObject_IsExtensible(DJSRuntime* runtime, DJSObject* obj) {
  return obj->vtable->IsExtensible(runtime, obj);
}

DJSCompletion DJSObject_GetOwnProperty(DJSRuntime* runtime,
                                       DJSObject* obj,
                                       DJSPropertyKey key) {
  return obj->vtable->GetOwnProperty(runtime, obj, key);
}
DJSCompletion DJSObject_Get(DJSRuntime* runtime,
                            DJSObject* obj,
                            DJSPropertyKey key) {
  return obj->vtable->Get(runtime, obj, key, DJSValue_object(obj));
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

const DJSString* DJS_new_string(DJSRuntime* UNUSED(runtime), const char* cstr) {
  DJSString* string = GC_MALLOC_ATOMIC(sizeof(DJSString));
  string->length = strlen(cstr);
  const char* buffer = GC_MALLOC_ATOMIC(string->length + 1);
  memcpy((void*)buffer, cstr, string->length);
  string->value = buffer;
  return string;
}

DJSValue DJS_new_string_as_value(DJSRuntime* runtime, const char* cstr) {
  return DJSString_to_value(DJS_new_string(runtime, cstr));
}

DJSCompletion DJSObject_Call(DJSRuntime* runtime,
                             DJSObject* f,
                             DJSValue this,
                             DJSValue* args,
                             size_t argc) {
  if (f->vtable->Call == NULL) {
    return DJSCompletion_abrupt(
        DJS_new_string_as_value(runtime, "TypeError: Object is not callable"));
  }
  return f->vtable->Call(runtime, f, this, args, argc);
}
