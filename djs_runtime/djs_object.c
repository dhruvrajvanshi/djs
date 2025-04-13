#include "./djs_object.h"
#include <assert.h>
#include <gc.h>
#include "./djs.h"
#include "./djs_comparison_ops.h"
#include "./djs_completion.h"
#include "./djs_object_ops.h"
#include "./djs_prelude.h"
#include "./djs_property.h"
#include "gc/gc.h"

static const DJSObjectVTable DJSOrdinaryObjectVTable;

DJSObject* MakeBasicObject(DJSRuntime* UNUSED(runtime)) {
  DJSObject* obj = GC_malloc(sizeof(DJSObject));
  DJSObject_init(obj, &DJSOrdinaryObjectVTable);
  return obj;
}

DJSObject* djs_object_new(DJSRuntime* runtime) {
  return MakeBasicObject(runtime);
}

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
DJSCompletion OrdinaryGetOwnProperty(DJSRuntime* UNUSED(runtime),
                                     DJSObject* obj,
                                     DJSPropertyKey key) {
  FOR_EACH_ENTRY(obj, entry) {
    if (property_key_eq(entry->key, key)) {
      DJSProperty* descriptor = entry->descriptor;
      if (!djs_property_is_data(descriptor)) {
        assert(djs_property_is_accessor(descriptor));
      }
      return djs_completion_normal(djs_property_as_value(descriptor));
    };
  }
  return djs_completion_normal(djs_undefined());
}

bool ValidateAndApplyPropertyDescriptor(DJSObject* O,
                                        const DJSPropertyKey P,
                                        const DJSValue extensible,
                                        const DJSProperty* Desc,
                                        const DJSValue current

) {
  if (djs_is_undefined(current)) {
    if (djs_is_false(extensible)) {
      return false;
    }
    if (O == NULL) {
      return true;
    }
    if (djs_property_is_accessor(Desc)) {
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
  DJSProperty* current_property = djs_property_from_value(current);
  assert(current_property);
  if (!djs_property_is_configurable(*current_property)) {
    DJS_TODO();
  }
  if (O != NULL) {
    if (djs_property_is_data(current_property) &&
        djs_property_is_accessor(Desc)) {
      DJS_TODO();
    } else if (djs_property_is_accessor(current_property) &&
               djs_property_is_data(Desc)) {
      DJS_TODO();
    } else {
      *current_property = *Desc;
    }
  }
  return true;
}

DJSCompletion IsExtensible(DJSRuntime* runtime, DJSObject* obj) {
  return obj->vtable->IsExtensible(runtime, obj);
}

/// https://tc39.es/ecma262/#sec-ordinarydefineownproperty
DJSCompletion OrdinaryDefineOwnProperty(DJSRuntime* runtime,
                                        DJSObject* self,
                                        DJSPropertyKey key,
                                        DJSProperty* descriptor) {
  DJSValue current;
  DJS_COMPLETION_SET(current, self->vtable->GetOwnProperty(runtime, self, key));

  DJSValue extensible;
  DJS_COMPLETION_SET(extensible, IsExtensible(runtime, self));

  bool result = ValidateAndApplyPropertyDescriptor(self, key, extensible,
                                                   descriptor, current);
  return djs_completion_normal(djs_bool(result));
}

DJSCompletion OrdinaryIsExtensible(DJSRuntime* UNUSED(runtime),
                                   DJSObject* obj) {
  return djs_completion_normal(djs_bool(obj->is_extensible));
}

DJSCompletion OrdinaryGetPrototypeOf(DJSRuntime* UNUSED(runtime),
                                     DJSObject* obj) {
  if (obj->prototype == NULL) {
    return djs_completion_normal(djs_null());
  }
  return djs_completion_normal(djs_object(obj->prototype));
}

DJSCompletion OrdinarySetPrototypeOf(DJSRuntime* UNUSED(runtime),
                                     DJSObject* O,
                                     DJSObject* NULLABLE V) {
  DJSObject* current = O->prototype;
  if (SameValueObject(V, current)) {
    return djs_completion_normal(djs_true());
  }
  bool extensible = O->is_extensible;
  if (!extensible) {
    return djs_completion_normal(djs_false());
  }
  DJSObject* p = V;
  bool done = false;

  while (!done) {
    if (p == NULL) {
      done = true;
      break;
    }
    if (SameValueObject(O, p)) {
      return djs_completion_normal(djs_false());
    }
    if (p->vtable->GetPrototypeOf != OrdinaryGetPrototypeOf) {
      done = true;
      break;
    } else {
      p = p->prototype;
    }
  }
  O->prototype = V;

  return djs_completion_normal(djs_true());
}

DJSCompletion Call(DJSRuntime* runtime,
                   DJSObject* f,
                   DJSValue this,
                   DJSValue* args,
                   size_t argc) {
  if (f->vtable->Call == NULL) {
    return djs_completion_abrupt(djs_value_from(
        djs_string_new(runtime, "TypeError: Object is not callable")));
  }
  return f->vtable->Call(runtime, f, this, args, argc);
}
DJSCompletion djs_call(DJSRuntime* runtime,
                       DJSObject* f,
                       DJSValue this,
                       DJSValue* args,
                       size_t argc) {
  return Call(runtime, f, this, args, argc);
}

DJSCompletion OrdinaryGet(DJSRuntime* runtime,
                          DJSObject* O,
                          DJSPropertyKey key,
                          DJSValue receiver) {
  DJSValue desc_value;
  // 1. Let desc be ? O.[[GetOwnProperty]](P).
  DJS_COMPLETION_SET(desc_value, O->vtable->GetOwnProperty(runtime, O, key));
  // 2. If desc is undefined, then
  if (djs_is_undefined(desc_value)) {
    // a. Let parent be ? O.[[GetPrototypeOf]]().
    DJSValue parent_value;
    DJS_COMPLETION_SET(parent_value, O->vtable->GetPrototypeOf(runtime, O));
    // b. If parent is null, return undefined.
    if (djs_is_null(parent_value)) {
      return djs_completion_normal(djs_undefined());
    }

    // c. Return ? parent.[[Get]](P, Receiver).
    DJSObject* parent = djs_value_as_object(parent_value);
    assert(parent ||
           "O->vtable->GetPrototypeOf returned a non-object, non-null value");

    return parent->vtable->Get(runtime, parent, key, receiver);
  }
  DJSProperty* desc = djs_property_from_value(desc_value);
  assert(desc ||
         "O->vtable->GetOwnProperty returned a non-descriptor, non undefined "
         "value");
  // 3. If IsDataDescriptor(desc) is true, return desc.[[Value]].
  if (djs_property_is_data(desc)) {
    return djs_completion_normal(desc->as.data.value);
  }
  assert(djs_property_is_accessor(desc));
  DJSFunction* getter = desc->as.accessor.get;
  if (getter == NULL) {
    return djs_completion_normal(djs_undefined());
  }
  return Call(
      runtime,
      // cast is safe because DJSFunction has a DJSObject as its first member
      (DJSObject*)getter, receiver, nullptr, 0);
}

DJSCompletion djs_object_set_prototype_of(DJSRuntime* runtime,
                                          DJSObject* NONNULL obj,
                                          DJSObject* NULLABLE proto) {
  return obj->vtable->SetPrototypeOf(runtime, obj, proto);
}

DJSCompletion DJSObject_IsExtensible(DJSRuntime* runtime, DJSObject* obj) {
  return obj->vtable->IsExtensible(runtime, obj);
}

DJSCompletion djs_object_get_own_property(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key) {
  return obj->vtable->GetOwnProperty(runtime, obj, key);
}
DJSCompletion Get(DJSRuntime* runtime, DJSObject* obj, DJSPropertyKey key) {
  return obj->vtable->Get(runtime, obj, key, djs_object(obj));
}
DJSCompletion djs_object_get(DJSRuntime* runtime,
                             DJSObject* obj,
                             DJSPropertyKey key) {
  return Get(runtime, obj, key);
}

DJSCompletion djs_object_define_own_property(DJSRuntime* runtime,
                                             DJSObject* obj,
                                             DJSPropertyKey key,
                                             DJSProperty* descriptor) {
  return obj->vtable->DefineOwnProperty(runtime, obj, key, descriptor);
}

DJSCompletion CreateDataProperty(DJSRuntime* runtime,
                                 DJSObject* obj,
                                 DJSPropertyKey key,
                                 DJSValue value) {
  DJSProperty* descriptor = djs_property_new_data(runtime, value);
  djs_property_set_configurable(descriptor, true);
  djs_property_set_enumerable(descriptor, true);
  djs_property_set_writable(descriptor, true);
  return obj->vtable->DefineOwnProperty(runtime, obj, key, descriptor);
}

DJSCompletion HasOwnProperty(DJSRuntime* runtime,
                             DJSObject* obj,
                             DJSPropertyKey key) {
  DJSValue own_property;
  DJS_COMPLETION_SET(own_property,
                     obj->vtable->GetOwnProperty(runtime, obj, key));
  if (djs_is_undefined(own_property)) {
    return djs_completion_normal(djs_false());
  } else {
    return djs_completion_normal(djs_true());
  }
}
DJSCompletion djs_object_has_own_property(DJSRuntime* runtime,
                                          DJSObject* obj,
                                          DJSPropertyKey key) {
  return HasOwnProperty(runtime, obj, key);
}
