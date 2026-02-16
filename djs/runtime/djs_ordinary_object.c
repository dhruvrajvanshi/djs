#include "djs.h"
#include "djs_ordinary_object.h"
#include "djs_object.h"
#include <assert.h>

bool property_key_eq(DJSPropertyKey a, DJSPropertyKey b)
{
    if (a.type != b.type)
    {
        return false;
    }
    switch (a.type)
    {
    case DJS_PROPERTY_KEY_STRING:
        return a.as.string == b.as.string;
    case DJS_PROPERTY_KEY_SYMBOL:
        return a.as.symbol == b.as.symbol;
    default:
        assert(false && "Unknown property key type");
        return false;
    }
}

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
DJSProperty *NULLABLE OrdinaryGetOwnProperty(DJSRuntime *UNUSED(runtime),
                                             DJSObject *obj,
                                             DJSPropertyKey key)
{
    FOR_EACH_ENTRY(obj, entry)
    {
        if (property_key_eq(entry->key, key))
        {
            DJSProperty *descriptor = entry->descriptor;
            if (!djs_property_is_data(descriptor))
            {
                assert(djs_property_is_accessor(descriptor));
            }
            return descriptor;
        };
    }
    return nullptr;
}

bool ValidateAndApplyPropertyDescriptor(DJSObject *O,
                                        const DJSPropertyKey P,
                                        bool extensible,
                                        const DJSProperty *Desc,
                                        DJSProperty *NULLABLE current

)
{
    if (current == nullptr)
    {
        if (!extensible)
        {
            return false;
        }
        if (O == NULL)
        {
            return true;
        }
        if (djs_property_is_accessor(Desc))
        {
            DJSObjectEntry *entry = GC_MALLOC(sizeof(DJSObjectEntry));
            entry->key = P;
            entry->next = O->properties;
            entry->descriptor = GC_MALLOC(sizeof(DJSProperty));
            *entry->descriptor = *Desc;
            O->properties = entry;
            return true;
        }
        else
        {
            DJSObjectEntry *entry = GC_MALLOC(sizeof(DJSObjectEntry));
            entry->key = P;
            entry->next = O->properties;
            entry->descriptor = GC_MALLOC(sizeof(DJSProperty));
            *entry->descriptor = *Desc;
            O->properties = entry;
            return true;
        }
    }
    DJSProperty *current_property = current;
    assert(current_property);
    if (!djs_property_is_configurable(current_property))
    {
        DJS_TODO();
    }
    if (O != NULL)
    {
        if (djs_property_is_data(current_property) &&
            djs_property_is_accessor(Desc))
        {
            DJS_TODO();
        }
        else if (djs_property_is_accessor(current_property) &&
                 djs_property_is_data(Desc))
        {
            DJS_TODO();
        }
        else
        {
            *current_property = *Desc;
        }
    }
    return true;
}

bool IsExtensible(DJSRuntime *runtime, DJSObject *obj)
{
    return obj->vtable->IsExtensible(runtime, obj);
}

/// https://tc39.es/ecma262/#sec-ordinarydefineownproperty
bool OrdinaryDefineOwnProperty(DJSRuntime *runtime,
                               DJSObject *self,
                               DJSPropertyKey key,
                               DJSProperty *descriptor)
{
    DJSProperty *current = self->vtable->GetOwnProperty(runtime, self, key);

    bool extensible = IsExtensible(runtime, self);

    return ValidateAndApplyPropertyDescriptor(self, key, extensible,
                                              descriptor, current);
}

bool OrdinaryIsExtensible(DJSRuntime *UNUSED(runtime),
                          DJSObject *obj)
{
    return obj->is_extensible;
}

DJSObject *NULLABLE OrdinaryGetPrototypeOf(DJSRuntime *UNUSED(runtime),
                                           DJSObject *obj)
{
    if (obj->prototype == NULL)
    {
        return nullptr;
    }
    return obj->prototype;
}

/// https://tc39.es/ecma262/#sec-sametype
bool SameType(DJSValue x, DJSValue y);

/// https://tc39.es/ecma262/#sec-samevalue
bool SameValue(DJSValue x, DJSValue y);

/// A specialization of DJS_SameValue for Objects.
/// Just compares the pointers.
/// It's only there to ease translation from the spec
/// when it calls for SameValue(x, y) but you have 2 objects.
static inline bool SameValueObject(DJSObject *NULLABLE x,
                                   DJSObject *NULLABLE y)
{
    return x == y;
}

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool IsStrictlyEqual(DJSValue x, DJSValue y);

bool OrdinarySetPrototypeOf(DJSRuntime *UNUSED(runtime),
                            DJSObject *O,
                            DJSObject *NULLABLE V)
{
    DJSObject *current = O->prototype;
    if (SameValueObject(V, current))
    {
        return true;
    }
    bool extensible = O->is_extensible;
    if (!extensible)
    {
        return false;
    }
    DJSObject *p = V;
    bool done = false;

    while (!done)
    {
        if (p == NULL)
        {
            done = true;
            break;
        }
        if (SameValueObject(O, p))
        {
            return false;
        }
        if (p->vtable->GetPrototypeOf != OrdinaryGetPrototypeOf)
        {
            done = true;
            break;
        }
        else
        {
            p = p->prototype;
        }
    }
    O->prototype = V;

    return true;
}

DJSValue Call(DJSRuntime *runtime,
              DJSObject *f,
              DJSValue this,
              DJSValue *args,
              size_t argc)
{
    if (f->vtable->Call == NULL)
    {
        djs_throw(runtime, djs_string_new(runtime, "TypeError: Object is not callable"));
        return djs_undefined();
    }
    return f->vtable->Call(runtime, this, args, argc);
}

DJSValue djs_call(DJSRuntime *runtime,
                  DJSObject *f,
                  DJSValue this,
                  DJSValue *args,
                  size_t argc)
{
    return Call(runtime, f, this, args, argc);
}

DJSValue OrdinaryGet(DJSRuntime *runtime,
                     DJSObject *O,
                     DJSPropertyKey key,
                     DJSValue receiver)
{

    // 1. Let desc be ? O.[[GetOwnProperty]](P).
    DJSProperty *desc_value = O->vtable->GetOwnProperty(runtime, O, key);
    // 2. If desc is undefined, then
    if (!desc_value)
    {
        // a. Let parent be ? O.[[GetPrototypeOf]]().
        DJSObject *parent_value = O->vtable->GetPrototypeOf(runtime, O);
        // b. If parent is null, return undefined.
        if (!parent_value)
        {
            return djs_undefined();
        }

        // c. Return ? parent.[[Get]](P, Receiver).
        DJSObject *parent = parent_value;
        assert(parent ||
               "O->vtable->GetPrototypeOf returned a non-object, non-null value");

        return parent->vtable->Get(runtime, parent, key, receiver);
    }
    DJSProperty *desc = desc_value;
    assert(desc ||
           "O->vtable->GetOwnProperty returned a non-descriptor, non undefined "
           "value");
    // 3. If IsDataDescriptor(desc) is true, return desc.[[Value]].
    if (djs_property_is_data(desc))
    {
        return desc->as.data.value;
    }
    assert(djs_property_is_accessor(desc));
    auto getter = desc->as.accessor.getter;
    if (getter == NULL)
    {
        return djs_undefined();
    }
    return Call(
        runtime,
        // cast is safe because DJSFunction has a DJSObject as its first member
        (DJSObject *)getter, receiver, nullptr, 0);
}
