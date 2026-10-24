let count = 0;
const p = Promise.resolve(1);
let index = 0;
while (index < 80) {
  p.then(() => { count = count + 1; });
  index = index + 1;
}
p.then(() => {
  console.log("first", count);
  p.then(() => console.log("nested"));
});
p.then(() => console.log("second"));
while (index < 4000) { index = index + 1; }
console.log("sync", count);
