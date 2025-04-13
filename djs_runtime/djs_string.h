#pragma once

#include <gc.h>
#include <memory.h>
#include <stddef.h>
#include <string.h>
#include "djs.h"

typedef struct DJSString {
  size_t length;
  const char* value;
} DJSString;

bool djs_string_eq(const DJSString* left, const DJSString* right);
