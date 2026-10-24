const pending = Promise.withResolvers();
const p = new Promise((resolve, reject) => {
  resolve(pending.promise); reject("late rejection"); resolve("late value"); throw "late throw";
});
p.then(value => console.log(value), error => console.log("wrong", error));
pending.resolve("adopted");
