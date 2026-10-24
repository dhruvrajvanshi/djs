import fs from "node:fs/promises"

console.log(await fs.readFile("../test-file.txt", "utf8"))
