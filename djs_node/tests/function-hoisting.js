const first = make(5);
const second = make(20);
function make(initial) {
  let value = initial;
  return {
    increment: function() { value = value + 1; return value; },
    read: function() { return value; }
  };
}
console.log(first.read(), first.increment(), first.read(), second.read());
