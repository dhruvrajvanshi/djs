#pragma once
#include "./property.h"
#include "./value.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

typedef struct DJSObjectEntry DJSObjectEntry;
typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;

DJSObject *DJS_MakeBasicObject(DJSRuntime *runtime);

/// https://tc39.es/ecma262/#sec-ordinarygetownproperty
OptDJSProperty DJS_OrdinaryGetOwnProperty(DJSObject *obj, DJSPropertyKey);
