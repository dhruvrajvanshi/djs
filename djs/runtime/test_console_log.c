#include "djs.h"

DJSValue console_log(DJSRuntime *runtime, DJSValue this, DJSValue* args, size_t argc) {
    DJS_PANIC("UNIMPLEMENTED");
}
int main() {
    DJSRuntime* runtime = djs_new_runtime();
    DJSValue console = djs_object_new(runtime);
    DJSValue log_func = djs_function_new(runtime, console_log);
    djs_define_own_property(
        runtime,
        console.as.object,
        djs_property_key_from_string(djs_string_new(runtime, "log").as.string),
        djs_property_new_data(
            runtime,
            log_func
        )
    );
    djs_free_runtime(runtime);
    return 0;
}
