#include "./comparison_ops.h"
#include "value.h"
#include <assert.h>
#include <math.h>

bool DJS_SameType(DJSValue x, DJSValue y) { return x.type == y.type; }

/// https://tc39.es/ecma262/#sec-numeric-types-number-equal
bool NumberEqual(double x, double y) {
  if (isnan(x)) {
    return false;
  }
  if (isnan(y)) {
    return false;
  }
  return x == y;
}

/// https://tc39.es/ecma262/#sec-samevaluenonnumber
bool DJS_SameValueNonNumber(DJSValue x, DJSValue y) {
  assert(DJS_SameType(x, y) ||
         "DJS_SameValueNonNumber must be called on values of the same type");
  if (x.type == DJS_TYPE_UNDEFINED || x.type == DJS_TYPE_NULL) {
    return true;
  }
  // TODO: Handle bigints
  if (x.type == DJS_TYPE_STRING) {
    return DJSString_eq(*x.as.string, *y.as.string);
  }
  if (x.type == DJS_TYPE_BOOLEAN) {
    return x.as.boolean == y.as.boolean;
  }
  return x.as.object == y.as.object;
}

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue x, DJSValue y) {
  if (!DJS_SameType(x, y)) {
    return false;
  }
  if (x.type == DJS_TYPE_NUMBER) {
    return NumberEqual(x.as.number, y.as.number);
  }
  return DJS_SameValueNonNumber(x, y);
}
