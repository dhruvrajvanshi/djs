import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
const a = [1,,3];
console.log(a.push(4,5),a.pop(),a.shift(),a.unshift(7,8),a.join("|"));
console.log(a.splice(1,2,"a","b","c").join("|"),a.join("|"));
console.log(a.reverse().join("|"),a.fill(9,-2).join("|"));
console.log([1,,3,4].copyWithin(1,0,3).join("|"));
console.log([1,,3].concat([4,,6],7).join("|"));
console.log([3,undefined,,1,2].sort().join("|"));
const stable = [{k:1,v:"a"},{k:0,v:"b"},{k:1,v:"c"}];
console.log(stable.sort((a,b)=>a.k-b.k).map(x=>x.v).join());
console.log([1,[2,,[3]],,4].flat(2).join());
console.log([1,2].flatMap(x=>[x,x*2]).join());
console.log([1,,3].toReversed().join("|"),1 in [1,,3].toReversed());
console.log([3,,1].toSorted().join("|"),2 in [3,,1].toSorted());
console.log([1,2,3].with(-1,9).join(),[1,2,3].toSpliced(1,1,7,8).join());
console.log([1,2,3].reduceRight((a,b)=>a-b), [1,2,3].findLast(x=>x<3), [1,2,3].findLastIndex(x=>x<3));
console.log([].every(()=>false),[].some(()=>true),[1,2].at(-1));
const cyclic = [1]; cyclic[1] = cyclic; console.log(cyclic.join());
try { [].reduce((a,b)=>a+b) } catch(e) {console.log(e.name)}
try { [1].with(2,0) } catch(e) {console.log(e.name)}
try { new Array.prototype.map() } catch(e) {console.log(e.name)}
