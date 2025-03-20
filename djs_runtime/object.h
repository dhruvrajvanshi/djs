#pragma once
#include "./value.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;

DJSObject *DJS_MakeBasicObject(DJSRuntime *runtime);
