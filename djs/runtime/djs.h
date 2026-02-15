#pragma once
#include <gc.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#ifdef __GNUC__
#define UNUSED(x) UNUSED_##x __attribute__((__unused__))
#else
#define UNUSED(x) UNUSED_##x
#endif

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;
typedef struct DJSValue DJSValue;
typedef struct DJSPropertyKey DJSPropertyKey;
typedef struct DJSProperty DJSProperty;
typedef struct DJSString DJSString;
typedef DJSValue (*DJSFunctionPtr)(DJSRuntime*, DJSValue this, DJSValue* args, size_t argc);

typedef enum DJSValueType {
    DJS_TYPE_UNDEFINED,
    DJS_TYPE_NULL,
    DJS_TYPE_BOOLEAN,
    DJS_TYPE_NUMBER,
    DJS_TYPE_STRING,
    DJS_TYPE_OBJECT,
    DJS_TYPE_SYMBOL
} DJSValueType;

typedef struct DJSRuntime {
    size_t next_symbol_id;
} DJSRuntime;

typedef struct DJSValue {
    DJSValueType type;
    union {
        bool boolean;
        double number;
        DJSObject* object;
        const DJSString* string;
        size_t symbol;
    } as;
} DJSValue;

typedef struct DJSObject {
    DJSObject* prototype;
    DJSFunctionPtr call;
} DJSObject;

typedef struct DJSString {
    size_t length;
    char* chars;
} DJSString;

typedef struct DJSProperty {
    enum {
        DJS_PROPERTY_DATA,
        DJS_PROPERTY_ACCESSOR
    } type;
    union {
        struct {
            DJSValue value;
            bool writable;
        } data;
        struct {
            DJSFunctionPtr getter;
            DJSFunctionPtr setter;
        } accessor;
    } as;
} DJSProperty;

typedef struct DJSPropertyKey {
    enum {
        DJS_PROPERTY_KEY_STRING,
        DJS_PROPERTY_KEY_SYMBOL
    } type;
    union {
        const DJSString* string;
        size_t symbol;
    } as;
} DJSPropertyKey;

DJSRuntime* djs_new_runtime(void);
void djs_free_runtime(DJSRuntime* runtime);
DJSValue djs_object_new(DJSRuntime* runtime);
DJSValue djs_undefined(void);
DJSValue djs_null(void);
DJSValue djs_bool(bool value);
DJSValue djs_true(void);
DJSValue djs_false(void);
DJSValue djs_number(double value);
DJSValue djs_function_new(DJSRuntime*, DJSFunctionPtr call);
DJSValue djs_string_new(DJSRuntime*, const char* str);
DJSPropertyKey djs_property_key_from_string(const DJSString* string);
DJSProperty* djs_property_new_data(DJSRuntime*, DJSValue value);
DJSValue djs_define_own_property(
    DJSRuntime* runtime,
    DJSObject* obj,
    DJSPropertyKey key,
    DJSProperty* descriptor
);

#define DJS_ALLOC(runtime, T) \
    ((void)(runtime), GC_MALLOC(sizeof(T)))

#define DJS_PANIC(msg) \
    do { \
        fprintf(stderr, "Panic in (%s:%d): %s\n", __FILE__, __LINE__, msg); \
        exit(1); \
    } while (0)
