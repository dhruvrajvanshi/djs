# Realm
A realm is the set of builtin objects a program needs: %Object.prototype%, %Array%, %TypeError% and so on.

In djs, most of these are implemented in Javascript itself.

Since basic JS syntax relies on the realm objects being present, [runtime/bootstrap.ts](../runtime/bootstrap.ts)
allocates objects for these names, then calls [stdlib/ecma/initialize-realm.js](../stdlib/ecma/initialize-realm.js)
which makes calls to `djs:vm` intrinsics to fill in the realm objects.

This includes things like the [ToPrimitive](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toprimitive)
(implemented [here](../stdlib/ecma/abstract-operations.js)).

## JS syntax in the stdlib
Since even the most innocent looking syntax triggers calls to functions defined in the
stdlib, stdlib code needs to be very careful to not trigger circularity.

For example

```js
const foo = a < 1 // VM will try to call ToPrimitive here, but it's not defined yet
// so we'll fail

export function foo() {
    return a < 1; // this is okay though because by the time this function is
                  // called, set_abstract_operation will already have been called.
}
set_abstract_operation("ToPrimitive", function to_primitive(value, hint) {
  // ... implementation
})
```

You can grep for `set_abstract_operation` and `set_internal_method`. These calls
have docstrings that explains when this these operations/methods are called by the VM.

Most of the time, it's hard to get accidentally tripped up on this because
- core operations/methods are defined in modules imported super early (e.g. abstract-operations.js)
- most of the stdlib code lives inside functions which run after the bootstrap, which don't have restrictions.

## Being careful of monkey patching
Stdlib functions must be careful not to accidentally rely on Object.prototype and
Array.prototype because they can be mutated by user code.

To get around this, whenever the stdlib needs to use arrays internally, it uses
[raw-arrays](../stdlib/raw/array.js) which create arrays without prototypes, and use
free standing functions instead of methods. See [stdlib/raw/README.md](../stdlib/raw/README.md)
for more info.
