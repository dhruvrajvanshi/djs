/**
 * values accessible through `djs:runtime` module.
 * This is the layer which the node:* stdlib is implemented on top of
 * aside from `djs:vm`, which provides basic JS stuff.
 */
import type { JSValue } from "../vm/storage/heap.ts"
import { heap_type_of, write_undefined } from "../vm/storage/value.ts"
import { HEAP_TYPES } from "../vm/storage/layout.ts"
import type { Runtime } from "../runtime/runtime.ts"
import type { HostError } from "../host/node.ts"
import {
  enqueue_job,
  operation_error,
  start_operation,
  write_host_value,
} from "../runtime/scheduler.ts"
import type { OperationOptions } from "../runtime/scheduler.ts"
import { read_string, write_string } from "../vm/heap_types/string.ts"
import { byte_buffer_view } from "../vm/heap_types/byte_buffer.ts"
import { OK, THROW, throw_error, throw_value } from "../vm/errors.ts"
import type { Status } from "../vm/errors.ts"
import { integer_argument, string_argument } from "./djs_vm.ts"
import type { NativeOperation } from "../vm/native_operations.ts"

export const RUNTIME_OPERATIONS: Record<string, NativeOperation> = {
  /**
   * Queues `job` to run after the current task, before any I/O callback.
   * @see https://tc39.es/ecma262/#sec-hostenqueuepromisejob
   */
  enqueue_job(runtime, destination, [job]) {
    if (
      job === undefined ||
      heap_type_of(runtime.heap, job) !== HEAP_TYPES.FUNCTION
    )
      return throw_error(runtime, "TypeError", "Job is not callable")
    enqueue_job(runtime, job)
    write_undefined(runtime.heap, destination)
    return OK
  },
  write_stdout(runtime, destination, [text]) {
    const { heap } = runtime
    if (!is_string(runtime, text))
      return throw_error(runtime, "TypeError", "write_stdout requires a string")
    runtime.host.write_stdout(read_string(heap, text))
    write_undefined(heap, destination)
    return OK
  },
  process_cwd(runtime, destination) {
    write_string(runtime.heap, destination, runtime.host.cwd())
    return OK
  },
  /**
   * Opens the file at `path` with `flags` and `mode`, then calls `resolve` with
   * a numeric handle, or `reject` with an error.
   * @see https://nodejs.org/api/fs.html#fspromisesopenpath-flags-mode
   */
  io_open(runtime, destination, [path, flags, mode, resolve, reject]) {
    const file_path = string_argument(runtime, path, "path")
    if (file_path === undefined) return THROW
    const open_flags = string_argument(runtime, flags, "flags")
    if (open_flags === undefined) return THROW
    const file_mode = integer_argument(runtime, mode, "mode", 0o7777)
    if (file_mode < 0) return THROW
    if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
    start_operation(
      runtime,
      resolve,
      reject,
      () => runtime.host.open(file_path, open_flags, file_mode),
      { syscall: "open", path: file_path },
    )
    write_undefined(runtime.heap, destination)
    return OK
  },
  /**
   * Reads up to `length` bytes from the file `handle` into `buffer` at
   * `offset`, then calls `resolve` with the number of bytes read, 0 at end of
   * file.
   * @see https://nodejs.org/api/fs.html#filehandlereadbuffer-offset-length-position
   */
  io_read(
    runtime,
    destination,
    [handle, buffer, offset, length, resolve, reject],
  ) {
    const { heap } = runtime
    const file_handle = integer_argument(runtime, handle, "file handle")
    if (file_handle < 0) return THROW
    const buffer_offset = integer_argument(
      runtime,
      offset,
      "buffer offset",
      0xffffffff,
    )
    if (buffer_offset < 0) return THROW
    const read_length = integer_argument(
      runtime,
      length,
      "read length",
      0xffffffff,
    )
    if (read_length < 0) return THROW
    if (
      buffer === undefined ||
      heap_type_of(heap, buffer) !== HEAP_TYPES.BYTE_BUFFER
    )
      return throw_error(runtime, "TypeError", "Expected a byte buffer")
    const capacity = byte_buffer_view(heap, buffer).length
    if (buffer_offset > capacity || read_length > capacity - buffer_offset)
      return throw_error(
        runtime,
        "RangeError",
        "Read exceeds byte buffer bounds",
      )
    if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
    start_operation(
      runtime,
      resolve,
      reject,
      () => runtime.host.read(file_handle, read_length),
      {
        buffer,
        offset: buffer_offset,
        length: read_length,
        syscall: "read",
      },
    )
    write_undefined(heap, destination)
    return OK
  },
  io_close(runtime, destination, [handle, resolve, reject]) {
    const file_handle = integer_argument(runtime, handle, "file handle")
    if (file_handle < 0) return THROW
    if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
    start_operation(
      runtime,
      resolve,
      reject,
      () => runtime.host.close(file_handle),
      { syscall: "close" },
    )
    write_undefined(runtime.heap, destination)
    return OK
  },
  /**
   * Returns the numeric fields of Node's `Stats` for `path`, without following
   * symlinks. With `resolve` and `reject`, runs asynchronously and passes the
   * result to `resolve` instead.
   * @see https://nodejs.org/api/fs.html#fslstatsyncpath-options
   */
  io_lstat(runtime, destination, [path, resolve, reject]) {
    const file_path = string_argument(runtime, path, "path")
    if (file_path === undefined) return THROW
    return host_operation(
      runtime,
      destination,
      resolve,
      reject,
      () => runtime.host.lstat_sync(file_path),
      () => runtime.host.lstat(file_path),
      { syscall: "lstat", path: file_path },
    )
  },
  /**
   * Returns the target of the symlink at `path`. With `resolve` and `reject`,
   * runs asynchronously and passes the result to `resolve` instead.
   * @see https://nodejs.org/api/fs.html#fsreadlinksyncpath-options
   */
  io_readlink(runtime, destination, [path, resolve, reject]) {
    const file_path = string_argument(runtime, path, "path")
    if (file_path === undefined) return THROW
    return host_operation(
      runtime,
      destination,
      resolve,
      reject,
      () => runtime.host.readlink_sync(file_path),
      () => runtime.host.readlink(file_path),
      { syscall: "readlink", path: file_path },
    )
  },
}

function is_string(runtime: Runtime, value: JSValue) {
  return (
    value !== undefined &&
    heap_type_of(runtime.heap, value) === HEAP_TYPES.STRING
  )
}

function host_operation(
  runtime: Runtime,
  destination: JSValue,
  resolve: JSValue,
  reject: JSValue,
  run_sync: () => unknown,
  run_async: () => Promise<unknown>,
  options: OperationOptions,
): Status {
  if (resolve === undefined && reject === undefined) {
    let result
    try {
      result = run_sync()
    } catch (error) {
      operation_error(
        runtime,
        destination,
        error as HostError,
        options.syscall,
        options.path,
      )
      return throw_value(runtime, destination)
    }
    write_host_value(runtime, destination, result)
    return OK
  }
  if (check_callbacks(runtime, resolve, reject) === THROW) return THROW
  start_operation(runtime, resolve, reject, run_async, options)
  write_undefined(runtime.heap, destination)
  return OK
}

function check_callbacks(runtime: Runtime, resolve: JSValue, reject: JSValue) {
  const { heap } = runtime
  if (
    resolve === undefined ||
    reject === undefined ||
    heap_type_of(heap, resolve) !== HEAP_TYPES.FUNCTION ||
    heap_type_of(heap, reject) !== HEAP_TYPES.FUNCTION
  )
    return throw_error(
      runtime,
      "TypeError",
      "I/O operation requires resolve and reject callbacks",
    )
  return OK
}
