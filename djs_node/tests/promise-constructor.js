console.log(typeof Promise, Promise.name, Promise.length);
const promise = new Promise((resolve, reject) => {
  console.log("executor"); resolve(7); reject(8); throw 9;
});
console.log(promise instanceof Promise, promise.constructor === Promise);
promise.then(value => console.log("fulfilled", value));
console.log("sync");
