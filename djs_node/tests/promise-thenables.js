let reads = 0;
const then = function(resolve, reject) {
  console.log("then", this.value); resolve(12); reject(13); throw 14;
};
then.call = () => { throw "patched call"; };
const thenable = { value: 11, get then() { reads = reads + 1; console.log("get"); return then; } };
const p = Promise.resolve(thenable);
console.log("sync", reads);
p.then(value => console.log("result", value, reads));
Promise.resolve({ get then() { throw "getter"; } }).catch(error => console.log(error));
