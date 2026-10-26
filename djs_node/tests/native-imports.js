import "djs:native";
import { write_stdout as write, io_read } from "djs:host";
import { host_enqueue_promise_job as enqueue_job, call } from "djs:native";
console.log(typeof write, typeof io_read, typeof enqueue_job, typeof call);
const emit = write;
emit("direct\n");
const holder = { write };
holder.write("member\n");
call(write, undefined, "called\n");
enqueue_job(() => write("queued\n"));
console.log(emit("return\n") === undefined);
try { write = () => {}; } catch (error) { console.log(error.name); }
