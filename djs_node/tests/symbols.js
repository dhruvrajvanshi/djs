const a = Symbol("a")
const b = Symbol("a")
const empty = Symbol()
console.log(typeof a, a === a, a === b, a == b)
console.log(a.description, empty.description, Symbol(undefined).description)
console.log(a.toString(), empty.toString(), String(a))
console.log(a, Symbol.name, Symbol.length)
console.log(a.valueOf() === a, !a)
try { new Symbol() } catch (error) { console.log(error.name) }
try { "" + a } catch (error) { console.log(error.name) }
try { `${a}` } catch (error) { console.log(error.name) }
try { +a } catch (error) { console.log(error.name) }

const object = { [a]: 1, a: 2 }
object[b] = 3
console.log(object[a], object[b], object.a, object["Symbol(a)"])
console.log(a in object, Symbol("c") in object)
delete object[a]
console.log(a in object, object[a])
class Keys {
  [b]() { return "method" }
}
console.log(new Keys()[b]())

const symbols = Object.getOwnPropertySymbols({ x: 1, [a]: 1, [empty]: 2 })
console.log(symbols.length, symbols[0] === a, symbols[1] === empty)

const array = [1, 2]
array[a] = "tagged"
console.log(array.length, array[a])

console.log(Symbol.for("app") === Symbol.for("app"), Symbol.for("app") === Symbol("app"))
console.log(Symbol.keyFor(Symbol.for("app")), Symbol.keyFor(a))
console.log(typeof Symbol.iterator, Symbol.iterator.toString(), Symbol.iterator === Symbol.iterator)
try { Symbol.iterator = 1 } catch (error) { console.log(error.name) }
