const meta = import.meta
function url() {
  return import.meta.url
}
console.log(meta === import.meta)
console.log(typeof meta.url)
console.log(url() === meta.url)
console.log(meta.url.startsWith("file://"))
console.log(meta.url.endsWith("/tests/import-meta.js"))
