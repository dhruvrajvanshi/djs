import { get_or_insert } from "djs_std"
import assert, { AssertionError } from "node:assert"
import { spawn } from "node:child_process"

interface PrivateNode<T> {
  id: number
  value: T
}
export interface GraphNode<T> {
  id: number
  value: T
}

export class DirectedGraph {
  public static builder<T>(root: T): DirectedGraphBuilder<T> {
    return new DirectedGraphBuilderImpl<T>(root)
  }
}
interface IDirectedGraph<T> {
  nodes: Set<GraphNode<T>>
  edges: Set<[GraphNode<T>, GraphNode<T>]>
}

export interface DirectedGraphBuilder<T> extends DirectedGraphBuilderImpl<T> {}
class DirectedGraphBuilderImpl<T> implements IDirectedGraph<T> {
  #edges_from = new Map<PrivateNode<T>, Set<PrivateNode<T>>>()
  #nodes = new Set<PrivateNode<T>>()
  #current: PrivateNode<T>
  #next_id = 1

  constructor(root: T) {
    const node: PrivateNode<T> = { id: 0, value: root }
    this.#nodes.add(node)
    this.#current = node
  }

  get nodes(): Set<GraphNode<T>> {
    return new Set([...this.#nodes].map((node) => node))
  }

  get edges(): Set<[GraphNode<T>, GraphNode<T>]> {
    const edges = new Set<[GraphNode<T>, GraphNode<T>]>()
    for (const [from, to_set] of this.#edges_from.entries()) {
      for (const to of to_set) {
        edges.add([from, to])
      }
    }
    return edges
  }

  add_child(value: T): Disposable {
    const id = this.#next_id++
    const node: PrivateNode<T> = { value, id }
    this.#nodes.add(node)
    get_or_insert(this.#edges_from, this.#current, MAKE_EMPTY_SET).add(node)

    const previous_current = this.#current
    this.#current = node
    return make_disposable(() => {
      assert(
        this.#current === node,
        "Current node must be the one being disposed",
      )
      this.#current = previous_current
    })
  }
}

// #region DOT

export async function render_graph<T>(
  graph: IDirectedGraph<T>,
  attrs: (value: T) => Record<string, string>,
  output_file: string,
) {
  assert(
    output_file.endsWith(".png"),
    new AssertionError({
      stackStartFn: render_graph,
    }),
  )
  const dot_graph = graph_to_dot(graph, attrs)
  const dot_string = render_dot(dot_graph)
  console.debug("DOT string:\n", dot_string)
  return new Promise<void>((resolve, reject) => {
    const dot = spawn("dot", [`-Tpng`, "-o", output_file])

    // Send the DOT string to stdin
    dot.stdin.write(dot_string)
    dot.stdin.end()
    dot.stderr.on("data", (data) => {
      console.error(data)
    })

    dot.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`dot process exited with code ${code}`))
      }
    })

    dot.stderr.on("data", (data) => {
      console.error(`Error: ${data}`)
    })
  })
}
function render_dot(dot: DOT): string {
  const node_attrs = (attrs: Record<string, string>): string =>
    Object.entries(attrs)
      .map(([key, value]) => `${key}: ${value}`.replaceAll('"', '\\"'))
      .join("\\n")
  const nodes = [...dot.nodes]
    .map(
      (node) =>
        `  "${node.id}" [shape=record, label="${node_attrs(node.attrs)}"];`,
    )
    .join("\n")
  const edges = dot.edges
    .map(([from, to]) => `    "${from}" -> "${to}";`)
    .join("\n")
  return `
digraph G {
${nodes}
${edges}
}
  `
}

interface DOTNode {
  id: string
  attrs: Record<string, string>
}
interface DOT {
  nodes: Set<DOTNode>
  edges: [from_node_id: string, to_node_id: string][]
}

function graph_to_dot<T>(
  graph: IDirectedGraph<T>,
  attrs: (value: T) => Record<string, string>,
): DOT {
  const nodes = new Set<DOTNode>(
    [...graph.nodes].map(
      (node: GraphNode<T>): DOTNode => ({
        id: node.id.toString(),
        attrs: attrs(node.value),
      }),
    ),
  )
  const edges: [string, string][] = [...graph.edges].map(([from, to]) => [
    from.id.toString(),
    to.id.toString(),
  ])

  return { nodes, edges }
}
// #endregion DOT

function make_disposable(callback: () => void): Disposable {
  return {
    [Symbol.dispose]: callback,
  }
}

function MAKE_EMPTY_SET<T>(): Set<T> {
  return new Set<T>()
}
