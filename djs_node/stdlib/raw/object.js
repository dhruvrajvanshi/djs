import { object_create } from "djs:vm"

export function raw_object() {
  return object_create(null, "ordinary")
}
