#include "./djs_comparison_ops.h"
#include <assert.h>
#include <math.h>
#include "./djs.h"
#include "./djs_string.h"

bool SameType(DJSValue x, DJSValue y) {
  return x.type == y.type;
}

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
bool SameValueNonNumber(DJSValue x, DJSValue y) {
  assert(SameType(x, y) ||
         "DJS_SameValueNonNumber must be called on values of the same type");
  if (x.type == DJS_TYPE_UNDEFINED || x.type == DJS_TYPE_NULL) {
    return true;
  }
  // TODO: Handle bigints
  if (x.type == DJS_TYPE_STRING) {
    return djs_string_eq(x.as.string, y.as.string);
  }
  if (x.type == DJS_TYPE_BOOLEAN) {
    return x.as.boolean == y.as.boolean;
  }
  return x.as.object == y.as.object;
}

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool IsStrictlyEqual(DJSValue x, DJSValue y) {
  if (!SameType(x, y)) {
    return false;
  }
  if (x.type == DJS_TYPE_NUMBER) {
    return NumberEqual(x.as.number, y.as.number);
  }
  return SameValueNonNumber(x, y);
}

bool SameValue(DJSValue x, DJSValue y) {
  if (!SameType(x, y)) {
    return false;
  }
  if (x.type == DJS_TYPE_NUMBER) {
    return NumberEqual(x.as.number, y.as.number);
  }
  return SameValueNonNumber(x, y);
}
