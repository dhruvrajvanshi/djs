import type { Persistent } from "../vm/storage/heap.ts"
import { Heap } from "../vm/storage/heap.ts"
import { Frame } from "../vm/frame.ts"
import { CallStack, NO_FRAME } from "../vm/storage/stack.ts"
import type { NodeHost } from "../host/node.ts"
import { create_node_host } from "../host/node.ts"
import { Realm } from "../vm/realm.ts"
import { ModuleLoader } from "./modules.ts"
import { Scheduler } from "./scheduler.ts"

/** One agent: its heap, realm, loaded code, job queues and host. */
export class Runtime {
  readonly stack = new CallStack()
  readonly heap: Heap
  readonly realm: Realm
  readonly loader = new ModuleLoader()
  readonly scheduler = new Scheduler()
  readonly host: NodeHost = create_node_host()
  /** The value of the THROW status most recently returned. */
  readonly pending_exception: Persistent

  constructor() {
    this.heap = new Heap(this.stack)
    this.realm = new Realm(this.heap)
    this.pending_exception = this.heap.handles.persistent()
  }

  /** The innermost frame of the call stack, or null if it is empty. */
  get current_frame(): Frame | null {
    const { fp } = this.stack
    return fp === NO_FRAME ? null : new Frame(this, fp)
  }
}
