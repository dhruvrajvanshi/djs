import { get_or_insert } from "djs_std"
import assert, { AssertionError } from "node:assert"

interface InnerNode<T> {
  value: T
}
interface RootNode {}
type GraphNode<T> = InnerNode<T> | RootNode

export class DirectedGraph {
  public static builder<T>(): DirectedGraphBuilder<T> {
    return new DirectedGraphBuilderImpl<T>()
  }
}

export interface DirectedGraphBuilder<T> extends DirectedGraphBuilderImpl<T> {}
class DirectedGraphBuilderImpl<T> {
  private root: RootNode = {}
  private edges_from = new Map<GraphNode<T>, Set<GraphNode<T>>>()
  private nodes = new Set<GraphNode<T>>()
  private current: GraphNode<T> = this.root

  add_child(value: T): Disposable {
    const node: InnerNode<T> = { value }
    get_or_insert(this.edges_from, this.current, MAKE_EMPTY_SET).add(node)

    const previous_current = this.current
    this.current = node
    return make_disposable(() => {
      assert(
        this.current === node,
        "Current node must be the one being disposed",
      )
      this.current = previous_current
    })
  }
}

function make_disposable(callback: () => void): Disposable {
  return {
    [Symbol.dispose]: callback,
  }
}

function MAKE_EMPTY_SET<T>(): Set<T> {
  return new Set<T>()
}
