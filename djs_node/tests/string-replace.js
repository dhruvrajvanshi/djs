import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
console.log("abcabc".replace("bc","[$&]-$$-$1"));
console.log("abcabc".replaceAll("bc",(match,index,text)=>match+index+text.length));
console.log("abc".replaceAll("","-"),"".replaceAll("","-"));
console.log("abc".replace("b","$"+"`"+"/$'"));
let calls = 0;
console.log("abc".replace("z",()=>{calls=calls+1;return "x"}),calls);
console.log("abc".replaceAll("b",{toString(){return "!"}}));
