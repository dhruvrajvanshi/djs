#include "../../djs_runtime/djs.h"

DJSValue fib(DJSValue _0);
DJSValue fib(DJSValue _0) {
    DJSValue is_zero = djs_strict_eq(djs_number(0), _0)
  DJSValue is_one = djs_strict_eq(djs_number(1), _0)
  DJSValue should_ret_zero = djs_or(is_zero, is_one)
  if (should_ret_zero) goto .ret_zero:; else goto .recur:;
.ret_zero:
  return djs_number(0);
.recur:
  DJSValue n_minus_1 = djs_sub(_0, djs_number(1))
  DJSValue n_minus_2 = djs_sub(_0, djs_number(2))
  DJSValue fib_minus_1 = fib(n_minus_1)
  DJSValue fib_minus_2 = fib(n_minus_2)
  DJSValue result = djs_add(fib_minus_1, fib_minus_2)
  return result;
}