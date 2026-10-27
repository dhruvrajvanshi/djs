import { define_own_property, object_create } from "djs:vm"

export function raw_array() {
  return object_create(null, "array")
}

export function raw_array_push(list, value) {
  const defined = define_own_property(list, list.length, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
  if (!defined) throw new TypeError("Cannot push to a raw array")
}

export function raw_array_pop(list) {
  if (list.length === 0) return undefined
  const value = list[list.length - 1]
  list.length = list.length - 1
  return value
}

export function raw_array_join(list, separator) {
  let text = ""
  for (let index = 0; index < list.length; index = index + 1)
    text = index === 0 ? "" + list[index] : text + separator + list[index]
  return text
}

export function raw_array_sort(list, compare) {
  for (let index = 1; index < list.length; index = index + 1) {
    const value = list[index]
    let position = index
    while (position > 0 && compare(list[position - 1], value) > 0) {
      list[position] = list[position - 1]
      position = position - 1
    }
    list[position] = value
  }
}
