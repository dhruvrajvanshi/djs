## Stdlib
Prerequisite reading: [realm.md](./realm.md)

Most of the Javascript standard library in implemented in JS itself.
[initialize-realm.js](../stdlib/ecma/initialize-realm.js) is the entrypoint into the stdlib.

The VM defines a core set of primitives to deal with the JS objects on top of which the
stdlib is implemented. Each `djs:*` module is implemented in `builtin_modules/<name>.ts`.
- [djs:vm](../builtin_modules/djs_vm.ts): Contains basic operations which help with manipulating
  objects and writing to their internal "slots" which is logic that the spec defines but is not directly
  accessible to the JS language. It also exports the objects the VM creates before the stdlib runs
  (`well_known_intrinsic_objects`), and the hooks the stdlib uses to register abstract operations and
  internal methods while the realm is built.
- [djs:runtime](../builtin_modules/djs_runtime.ts): Contains io and other such primitives which
  aren't required for JS execution, but are a part of the "JS runtime" layer. Think of it as primitives
  on top of which you can implement `node:*` or `deno:*` or `bun:*` standard libraries.

Additionally, the node stdlib uses [djs:]

