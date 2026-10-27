import type { Persistent } from "../vm/storage/heap.ts"
import { Heap } from "../vm/storage/heap.ts"
import type { Fiber } from "../vm/execution/fiber.ts"
import type { NodeHost } from "../host/node.ts"
import { create_node_host } from "../host/node.ts"
import { Realm } from "./realm.ts"
import { ModuleLoader } from "./modules.ts"
import { Scheduler } from "./scheduler.ts"

/** One agent: its heap, realm, loaded code, job queues and host. */
export class Runtime {
  readonly heap: Heap
  readonly realm: Realm
  readonly loader = new ModuleLoader()
  readonly scheduler = new Scheduler()
  readonly host: NodeHost = create_node_host()
  fibers: Fiber[] = []
  /** Fibers being run, innermost last. A fiber runs others for nested calls. */
  running: Fiber[] = []
  /** The value of the THROW status most recently returned. */
  readonly pending_exception: Persistent

  constructor() {
    this.heap = new Heap()
    this.realm = new Realm(this.heap)
    this.pending_exception = this.heap.handles.persistent()
  }
}
