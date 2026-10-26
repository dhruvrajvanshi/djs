import { call, define_property_or_throw as define,
  get_own_property as descriptor, ordinary_set_prototype_of as setPrototype,
  ordinary_object_create as create } from "djs:native";
console.log(String(),String(undefined),String(null),String(123));
const s = new String("a😀z");
console.log(typeof s,s instanceof String,s.length,s[0],s[3],String(s),s.valueOf());
console.log(typeof String.prototype,String.prototype.length,String.prototype.valueOf());
const d = descriptor(s,"1");
console.log(d.value.charCodeAt(0),d.writable,d.enumerable,d.configurable);
const l = descriptor(s,"length"); console.log(l.value,l.writable,l.enumerable,l.configurable);
try { s[0] = "x" } catch(e) {console.log(e.name)}
try { s.length = 2 } catch(e) {console.log(e.name)}
try { delete s[0] } catch(e) {console.log(e.name)}
define(s,"0",{value:"a"});s.extra=4; console.log(s.extra,1 in s);
try { call(String.prototype.valueOf,{}) } catch(e) {console.log(e.name)}
console.log(call(String.prototype.charAt,1234,2),String.name,String.length);
try { new String.prototype.slice() } catch(e) {console.log(e.name)}
