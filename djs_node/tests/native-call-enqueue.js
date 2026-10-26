import { call, host_enqueue_promise_job as enqueue } from "djs:native";
import { write_stdout as write } from "djs:host";
function log(value) { write("" + value + "\n"); }
const fn = function(a, b) { return this.value + a + b; };
fn.call = () => { throw "patched"; };
log(call(fn, { value: 1 }, 2, 3));
const reason = {};
try { call(() => { throw reason; }, undefined); }
catch (error) { log(error === reason); }
try { enqueue(1); } catch (error) { log(error.name); }
enqueue(() => { log("first"); enqueue(() => log("nested")); });
enqueue(() => log("second"));
log("sync");
