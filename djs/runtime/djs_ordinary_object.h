#pragma once

#include "djs.h"

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
DJSProperty *NULLABLE OrdinaryGetOwnProperty(DJSRuntime *runtime,
                                             DJSObject *obj,
                                             DJSPropertyKey key);

/// https://tc39.es/ecma262/#sec-ordinarydefineownproperty
bool OrdinaryDefineOwnProperty(DJSRuntime *runtime,
                               DJSObject *self,
                               DJSPropertyKey key,
                               DJSProperty *descriptor);

bool OrdinaryIsExtensible(DJSRuntime *runtime, DJSObject *obj);
bool OrdinarySetPrototypeOf(DJSRuntime *runtime,
                            DJSObject *obj,
                            DJSObject *proto);

DJSObject *NULLABLE OrdinaryGetPrototypeOf(DJSRuntime *runtime, DJSObject *obj);
DJSValue OrdinaryGet(DJSRuntime *runtime,
                     DJSObject *O,
                     DJSPropertyKey key,
                     DJSValue receiver);
