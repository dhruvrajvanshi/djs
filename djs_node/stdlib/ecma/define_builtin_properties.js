import {
  define_own_property,
  get_own_property,
  ordinary_own_property_keys,
} from "djs:vm"

/**
 * Copies the properties of `members` onto `target`. They become
 * non-enumerable, like every builtin property, so `for…in` doesn't list them:
 *
 *   define_builtin_properties(array_prototype, { at(index) { … } })
 *
 * https://tc39.es/ecma262/multipage/ecmascript-standard-built-in-objects.html#sec-ecmascript-standard-built-in-objects
 */
export function define_builtin_properties(target, members) {
  const keys = ordinary_own_property_keys(members)
  let index = 0
  while (index < keys.length) {
    const key = keys[index]
    const member = get_own_property(members, key)
    member.enumerable = false
    if (!define_own_property(target, key, member))
      throw new TypeError("Cannot redefine property")
    index = index + 1
  }
}
