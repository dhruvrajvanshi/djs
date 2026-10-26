class Animal {
  legs = 4
  constructor(name) {
    this.name = name
  }
  speak() {
    return `${this.name} makes a sound`
  }
  static create(name) {
    return new this(name)
  }
}
class Dog extends Animal {
  tail = true
  constructor(name, breed) {
    super(name)
    this.breed = breed
  }
  speak() {
    return super.speak() + " (woof)"
  }
  static create(name) {
    return super.create(name)
  }
}
class Puppy extends Dog {}
const dog = new Dog("Rex", "lab")
console.log(dog.speak(), dog.breed, dog.legs, dog.tail)
console.log(
  dog instanceof Dog,
  dog instanceof Animal,
  Dog.create("Y") instanceof Dog,
)
const puppy = new Puppy("Bit", "pug")
console.log(
  puppy.speak(),
  puppy.breed,
  puppy instanceof Puppy,
  Puppy.create("Z") instanceof Puppy,
)
class MyError extends Error {
  constructor(message) {
    super(message)
    this.code = 7
  }
}
const error = new MyError("boom")
console.log(
  error instanceof MyError,
  error instanceof Error,
  error.message,
  error.code,
)
class Early extends Animal {
  constructor() {
    this.x = 1
  }
}
try {
  new Early()
} catch (caught) {
  console.log(caught instanceof ReferenceError)
}
