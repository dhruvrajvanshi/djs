export interface FS {
  readFile(path: string, encoding: "utf-8"): Promise<string>
}
