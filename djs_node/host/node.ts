import type { FileHandle } from "node:fs/promises"
import fs from "node:fs/promises"
import { lstatSync, readlinkSync } from "node:fs"
import type { Stats } from "node:fs"

export interface HostError extends Error {
  code?: string
  exit_code?: number
}

export interface HostStats {
  dev: number
  ino: number
  mode: number
  nlink: number
  uid: number
  gid: number
  rdev: number
  size: number
  blksize: number
  blocks: number
  atimeMs: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
}

function host_stats(stats: Stats): HostStats {
  const { dev, ino, mode, nlink, uid, gid, rdev, size, blksize, blocks } = stats
  const { atimeMs, mtimeMs, ctimeMs, birthtimeMs } = stats
  return {
    dev,
    ino,
    mode,
    nlink,
    uid,
    gid,
    rdev,
    size,
    blksize,
    blocks,
    atimeMs,
    mtimeMs,
    ctimeMs,
    birthtimeMs,
  }
}

export interface NodeHost {
  read_text(path: string, encoding: BufferEncoding): Promise<string>
  open(path: string, flags: string, mode?: number): Promise<number>
  read(handle: number, length: number): Promise<Uint8Array>
  close(handle: number): Promise<void>
  lstat(path: string): Promise<HostStats>
  lstat_sync(path: string): HostStats
  readlink(path: string): Promise<string>
  readlink_sync(path: string): string
  write_stdout(text: string): void
  cwd(): string
}

export function create_node_host({
  stdout = process.stdout,
}: { stdout?: Pick<NodeJS.WriteStream, "write"> } = {}): NodeHost {
  const files = new Map<number, FileHandle>()
  let next_handle = 1
  function file(handle: number) {
    const value = files.get(handle)
    if (!value)
      throw Object.assign(new Error("Bad file handle"), { code: "EBADF" })
    return value
  }
  return {
    read_text(path: string, encoding: BufferEncoding) {
      return fs.readFile(path, encoding)
    },
    async open(path: string, flags: string, mode?: number) {
      const value = await fs.open(path, flags, mode)
      const handle = next_handle++
      files.set(handle, value)
      return handle
    },
    async read(handle: number, length: number) {
      const value = file(handle)
      const bytes = new Uint8Array(length)
      const { bytesRead } = await value.read(bytes, 0, length, null)
      return bytes.subarray(0, bytesRead)
    },
    async close(handle: number) {
      const value = file(handle)
      files.delete(handle)
      await value.close()
    },
    async lstat(path: string) {
      return host_stats(await fs.lstat(path))
    },
    lstat_sync(path: string) {
      return host_stats(lstatSync(path))
    },
    readlink(path: string) {
      return fs.readlink(path)
    },
    readlink_sync(path: string) {
      return readlinkSync(path)
    },
    write_stdout(text: string) {
      stdout.write(text)
    },
    cwd() {
      return process.cwd()
    },
  }
}
