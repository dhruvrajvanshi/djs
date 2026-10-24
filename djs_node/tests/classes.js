function make() {
  return class Box {
    #value = 2;
    #read() { return this.#value; }
    read = () => this.#read();
    static value = this;
    static has(value) { return #value in value; }
    method() { return this.#read; }
    get value() { return this.#value; }
    set value(next) { this.#value = next; }
  };
}
const Box = make();
const Other = make();
const first = new Box();
const second = new Box();
first["#value"] = 100;
first.value = 9;
const read = first.read;
console.log(read(), second.value, first.method() === second.method());
console.log(Box.value === Box, Box.has(first), Other.has(first));
try { const detached = first.method; detached(); } catch (e) { console.log(e.name); }
function ordinary() { return 23; }
console.log(ordinary());
