import { count, increment, shared, shadowed } from "./export-star/index.js";
console.log(count, shared, shadowed);
increment();
console.log(count);
