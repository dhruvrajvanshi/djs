const object = {
  value: 7,
  increment: function(amount) { this.value = this.value + amount; return this.value; },
  receiver: function() { return this; }
};
const detached = object.receiver;
console.log(object.increment(3), object.value, detached() === undefined);
console.log((object.receiver)() === object);
console.log(1, nested(2), 3);
function nested(value) { return value; }
