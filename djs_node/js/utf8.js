import { string_from_code_unit as character } from "djs:intrinsics"

export default class Utf8Decoder {
  #text = ""
  #point = 0
  #needed = 0
  #seen = 0
  #lower = 0x80
  #upper = 0xbf

  write(bytes, length) {
    let index = 0
    let byte, point
    while (index < length) {
      byte = bytes[index]
      if (this.#needed === 0) {
        if (byte < 0x80) this.#text = this.#text + character(byte)
        else if (byte >= 0xc2 && byte <= 0xdf) {
          this.#point = byte & 0x1f
          this.#needed = 1
        } else if (byte >= 0xe0 && byte <= 0xef) {
          this.#point = byte & 0x0f
          this.#needed = 2
          if (byte === 0xe0) this.#lower = 0xa0
          if (byte === 0xed) this.#upper = 0x9f
        } else if (byte >= 0xf0 && byte <= 0xf4) {
          this.#point = byte & 0x07
          this.#needed = 3
          if (byte === 0xf0) this.#lower = 0x90
          if (byte === 0xf4) this.#upper = 0x8f
        } else this.#text = this.#text + "\ufffd"
        index = index + 1
      } else if (byte < this.#lower || byte > this.#upper) {
        // Reprocess this byte as a possible new sequence starter.
        this.#needed = 0
        this.#seen = 0
        this.#lower = 0x80
        this.#upper = 0xbf
        this.#text = this.#text + "\ufffd"
      } else {
        this.#lower = 0x80
        this.#upper = 0xbf
        this.#point = (this.#point << 6) | (byte & 0x3f)
        this.#seen = this.#seen + 1
        index = index + 1
        if (this.#seen === this.#needed) {
          if (this.#point <= 0xffff)
            this.#text = this.#text + character(this.#point)
          else {
            point = this.#point - 0x10000
            this.#text =
              this.#text +
              character(0xd800 + (point - (point % 1024)) / 1024) +
              character(0xdc00 + (point & 0x3ff))
          }
          this.#needed = 0
          this.#seen = 0
        }
      }
    }
  }

  finish() {
    if (this.#needed !== 0) this.#text = this.#text + "\ufffd"
    this.#needed = 0
    this.#seen = 0
    this.#lower = 0x80
    this.#upper = 0xbf
    return this.#text
  }
}
