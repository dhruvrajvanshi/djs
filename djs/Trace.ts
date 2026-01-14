import assert, { AssertionError } from "node:assert"
import { spawn } from "node:child_process"
import { writeFile } from "node:fs/promises"

interface TraceNode {
  name: string
  label: string
}
export class Trace {
  root: TraceNode = { name: "root", label: "" }
  current: TraceNode = this.root
  nodes = new Map<string, TraceNode>([["root", this.root]])
  edges: [from: TraceNode, to: TraceNode][] = []

  add(name: string, label: string = "") {
    const node: TraceNode = { name, label }
    assert(
      !this.nodes.has(name),
      new AssertionError({
        message: `Node with name "${name}" already exists`,
        stackStartFn: this.add,
      }),
    )
    this.nodes.set(name, node)
    this.edges.push([this.current, node])
    const old_current = this.current
    this.current = node
    const self = this
    return {
      [Symbol.dispose]() {
        self.current = old_current
      },
    }
  }
  async write(path: string): Promise<void> {
    assert(
      path.endsWith(".png") || path.endsWith(".svg") || path.endsWith(".dot"),
      new AssertionError({
        message: "Output path must end with .png or .svg",
        stackStartFn: this.write,
      }),
    )

    function quote(str: string): string {
      return `"${str.replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`
    }
    const nodes = Array.from(this.nodes.values(), (n) =>
      n.label
        ? `  ${quote(n.name)}  [label=${quote(n.name + "\n" + n.label)}];`
        : `  ${quote(n.name)};`,
    ).join("\n")
    const edges = this.edges
      .map(([from, to]) => `  ${quote(from.name)} -> ${quote(to.name)};`)
      .join("\n")
    const dot_text = `
digraph trace {
  node [shape=box];
${nodes}
${edges}
}
    `
    if (path.endsWith(".dot")) {
      return writeFile(path, dot_text, "utf8")
    }
    const format = path.endsWith(".png") ? "png" : "svg"
    return dot_to_png(dot_text, path, format)
  }
}

function dot_to_png(
  dot_string: string,
  output_path: string,
  format: "png" | "svg",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const dotProcess = spawn("dot", [`-T${format}`, "-o", output_path])

    dotProcess.stderr.on("data", (data) => {
      console.error(data.toString())
    })

    dotProcess.on("error", (err) => {
      reject(err)
    })

    dotProcess.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`dot command failed with code ${code}`))
      }
    })

    dotProcess.stdin.write(dot_string)
    dotProcess.stdin.end()
  })
}
