# Raw primitives for the stdlib implementation

Stdlib doesn't use normal arrays because their methods can be overwritten
by user updates to Array.prototype or Object.prototype.
For this purpose, we have raw helpers in this directory.

They're just like standard collections, except they have a null prototype
and instead of methods, they have free standing functions.
