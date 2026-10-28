import { panic } from "../../utils.ts"
import type { Heap, JSValue } from "../storage/heap.ts"
import { VALUE_BYTES, get_ref, set_ref } from "../storage/value.ts"
import { HEAP_TYPES, SUSPENDED_FRAME } from "../storage/layout.ts"
import { FRAME, FRAME_FLAGS, NO_DESTINATION } from "../storage/stack.ts"
import type { CallStack } from "../storage/stack.ts"

// The values a frame holds besides its registers: ENVIRONMENT to REJECT.
const FRAME_HEADER_VALUES = (FRAME.REGISTERS - FRAME.ENVIRONMENT) / VALUE_BYTES

const HEADER_FIELDS = [
  [SUSPENDED_FRAME.PC, FRAME.PC],
  [SUSPENDED_FRAME.CODE, FRAME.CODE],
  [SUSPENDED_FRAME.FUNCTION, FRAME.FUNCTION],
  [SUSPENDED_FRAME.FLAGS, FRAME.FLAGS],
] as const

/** Creates an empty suspended frame with room for `register_count` registers. */
export function create_suspended_frame(
  heap: Heap,
  destination: JSValue,
  register_count: number,
) {
  const count = FRAME_HEADER_VALUES + register_count
  const reference = heap.allocate(
    HEAP_TYPES.SUSPENDED_FRAME,
    SUSPENDED_FRAME.VALUES - 8 + count * VALUE_BYTES,
  )
  heap.write_u32(reference + SUSPENDED_FRAME.COUNT, count)
  set_ref(heap, destination, reference)
}

/** Copies the frame at `fp`, which settles a promise, into `suspended`. */
export function save_frame(
  heap: Heap,
  stack: CallStack,
  suspended: JSValue,
  fp: number,
) {
  if (!(stack.read_u32(fp + FRAME.FLAGS) & FRAME_FLAGS.ASYNC))
    panic("Only frames that settle a promise suspend")
  const reference = get_ref(heap, suspended)
  const count = heap.read_u32(reference + SUSPENDED_FRAME.COUNT)
  if (count !== FRAME_HEADER_VALUES + stack.read_u32(fp + FRAME.REGISTER_COUNT))
    panic("Suspended frame size mismatch")
  for (const [to, from] of HEADER_FIELDS)
    heap.write_u32(reference + to, stack.read_u32(fp + from))
  heap.bytes.set(
    stack.bytes.subarray(fp + FRAME.ENVIRONMENT, stack.frame_end(fp)),
    reference + SUSPENDED_FRAME.VALUES,
  )
}

export function is_resumed(heap: Heap, suspended: JSValue) {
  return heap.read_u32(get_ref(heap, suspended) + SUSPENDED_FRAME.RESUMED) !== 0
}

/**
 * Pushes the frame saved in `suspended` back on the call stack, marks it
 * resumed and returns its offset, or undefined if the stack has no room for it.
 */
export function restore_frame(
  heap: Heap,
  stack: CallStack,
  suspended: JSValue,
): number | undefined {
  const reference = get_ref(heap, suspended)
  const count = heap.read_u32(reference + SUSPENDED_FRAME.COUNT)
  const fp = stack.push(count - FRAME_HEADER_VALUES)
  if (fp === undefined) return undefined
  for (const [from, to] of HEADER_FIELDS)
    stack.write_u32(fp + to, heap.read_u32(reference + from))
  stack.write_u32(fp + FRAME.DESTINATION, NO_DESTINATION)
  const values = reference + SUSPENDED_FRAME.VALUES
  stack.bytes.set(
    heap.bytes.subarray(values, values + count * VALUE_BYTES),
    fp + FRAME.ENVIRONMENT,
  )
  heap.write_u32(reference + SUSPENDED_FRAME.RESUMED, 1)
  return fp
}
