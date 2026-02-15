#include "djs.h"
#include <string.h>

DJSRuntime* djs_new_runtime(void) {
    DJSRuntime* runtime = GC_MALLOC(sizeof(DJSRuntime));
    return runtime;
}
void djs_free_runtime(DJSRuntime* runtime) {
    GC_FREE(runtime);
}

DJSValue djs_object_new(DJSRuntime* runtime) {
    DJSObject* obj = DJS_ALLOC(runtime, DJSObject);
    return (DJSValue) {.type = DJS_TYPE_OBJECT, .as = {.object = obj}};
}

DJSValue djs_string_new(DJSRuntime* runtime, const char* str) {
    DJSString* string = DJS_ALLOC(runtime, DJSString);
    string->length = strlen(str);
    string->chars = GC_STRDUP(str);
    return (DJSValue) {.type = DJS_TYPE_STRING, .as = {.string = string}};
}

DJSPropertyKey djs_property_key_from_string(const DJSString* string) {
    return (DJSPropertyKey) {.type = DJS_PROPERTY_KEY_STRING, .as = {.string = string}};
}

DJSProperty* djs_property_new_data(DJSRuntime* runtime, DJSValue value) {
    DJSProperty* property = DJS_ALLOC(runtime, DJSProperty);
    property->type = DJS_PROPERTY_DATA;
    property->as.data.value = value;
    property->as.data.writable = false;
    return property;
}

DJSValue djs_function_new(DJSRuntime* runtime, DJSFunctionPtr call) {
    DJSObject* func = DJS_ALLOC(runtime, DJSObject);
    func->call = call;
    return (DJSValue) {.type = DJS_TYPE_OBJECT, .as = {.object = (DJSObject*)func}};
}

DJSValue djs_define_own_property(
    DJSRuntime* UNUSED(runtime),
    DJSObject* UNUSED(obj),
    DJSPropertyKey UNUSED(key),
    DJSProperty* UNUSED(descriptor)
) {
    DJS_PANIC("NOT_IMPLEMENTED");
}
