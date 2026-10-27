const define = Object.defineProperty;
const retained = [new String("a😀b"), [1,,3]];
function Capture() { return () => new.target }
const target = new Capture();
define(retained[1], "1", { get() { return retained[0].codePointAt(1) }, configurable: true });
console.log(retained[1].map(value => value + 1).join("-"), retained[0][0], target() === Capture);
