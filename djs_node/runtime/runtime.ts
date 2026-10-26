import type { Root } from "../vm/storage/value.ts"
import { Memory } from "../vm/storage/memory.ts"
import type { Fiber } from "../vm/execution/fiber.ts"
import type { NodeHost } from "../host/node.ts"
import { create_node_host } from "../host/node.ts"
import { Realm } from "./realm.ts"
import { ModuleLoader } from "./modules.ts"
import { Scheduler } from "./scheduler.ts"

/** One agent: its heap, realm, loaded code, job queues and host. */
export class Runtime {
  readonly memory: Memory
  readonly realm: Realm
  readonly loader = new ModuleLoader()
  readonly scheduler = new Scheduler()
  readonly host: NodeHost = create_node_host()
  fibers: Fiber[] = []
  /** Fibers being run, innermost last. A fiber runs others for nested calls. */
  running: Fiber[] = []
  /** The value of the THROW status most recently returned. */
  readonly pending_exception: Root

  constructor() {
    this.memory = new Memory()
    this.realm = new Realm(this.memory)
    this.pending_exception = this.memory.alloc_root()
  }
}
