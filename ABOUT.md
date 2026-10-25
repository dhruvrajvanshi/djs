
DJS is a javascript superset and an interpreter + runtime which aims to have node js compatibility and
faster performance.

It aims to have most of the standard library written in JS (+ djs extensions ) it using a minimal set
of core primitives exposed by the runtime.

It only needs to support recent ECMA features and strict mode. It does not support common js.

## Language extensions

- There's a static type system which is sound at runtime. Unlike typescript, when you declare
  foo: Bar, it is actually guaranteed to be of type Bar at runtime. Casts do runtime checks
  and throw if the type doesn't match.

- We will have special annotations for classes which will allow static dispatch. `class Foo final {}` means
  that its slots and methods will never change (Object.defineProperty, etc will throw).
  This means that `const foo: Foo; foo.bar()` will be statically dispatched. Foo.baz will not be an object lookip
  but a pointer offset (in case baz is a field.)
  
- If a function foo with annotated parameters needs to be passed to a "generic" place, it will be boxed in a
```
function foo_boxed(...args: unknown[]): unkonwn {
 assert(args.length === 2)
 assert(args[0] is Bar)
 assert(args[1] is Baz) // is is a runtime type check which is similar to instanceof but works for all types
 return foo(...args)
}

function foo(a: Bar, b: Baz): Qux {
  return ...
}
```

Wherever foo needs to be upcasted to a `any` or `unknown` this boxed version will be used. But if a caller knows
the types, it can be statically dispatched and inlined during compile time.
