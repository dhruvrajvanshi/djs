const factory = {
  key: "value",
  make() { return class { [this.key] = 31; }; }
};
const Constructor = factory.make();
console.log(new Constructor().value);
class Private {
  #read() { return 1; }
  replace() { this.#read = () => 2; }
}
try { new Private().replace(); } catch (error) { console.log(error.name); }
const object = { value: 1, get value() { return 2; } };
console.log(object.value);
