import type { Root } from "../vm/storage/value.ts"
import type { MemoryOptions } from "../vm/storage/memory.ts"
import { Memory } from "../vm/storage/memory.ts"
import type { Fiber } from "../vm/execution/fiber.ts"
import type { NodeHost } from "../host/node.ts"
import { create_node_host } from "../host/node.ts"
import { Realm } from "./realm.ts"
import { ModuleLoader } from "./modules.ts"
import { Scheduler } from "./scheduler.ts"

export interface RuntimeOptions extends MemoryOptions {
  host?: NodeHost
  max_steps?: number
}

/** One agent: its heap, realm, loaded code, job queues and host. */
export class Runtime {
  readonly memory: Memory
  readonly realm: Realm
  readonly loader = new ModuleLoader()
  readonly scheduler = new Scheduler()
  readonly host: NodeHost
  readonly max_steps: number
  fibers: Fiber[] = []
  /** The value of the THROW status most recently returned. */
  readonly pending_exception: Root

  constructor({
    host = create_node_host(),
    max_steps = 1000000,
    ...memory_options
  }: RuntimeOptions = {}) {
    this.memory = new Memory(memory_options)
    this.realm = new Realm(this.memory)
    this.host = host
    this.max_steps = max_steps
    this.pending_exception = this.memory.alloc_root()
  }
}
