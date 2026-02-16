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

#define NULLABLE _Nullable

#define DJS_PANIC(msg)                                                                   \
    do                                                                                   \
    {                                                                                    \
        fprintf(stderr, "Panic in %s (%s:%d): %s\n", __func__, __FILE__, __LINE__, msg); \
        exit(1);                                                                         \
    } while (0)

#define DJS_TODO()                                                             \
    do                                                                         \
    {                                                                          \
        fprintf(stderr, "TODO in %s (%s:%d)\n", __func__, __FILE__, __LINE__); \
        exit(1);                                                               \
    } while (0)

typedef struct DJSRuntime DJSRuntime;
typedef struct DJSObject DJSObject;
typedef struct DJSValue DJSValue;
typedef struct DJSPropertyKey DJSPropertyKey;
typedef struct DJSProperty DJSProperty;
typedef struct DJSString DJSString;
typedef DJSValue (*DJSFunctionPtr)(DJSRuntime *, DJSValue this, DJSValue *, size_t);

typedef enum DJSValueType
{
    DJS_TYPE_UNDEFINED,
    DJS_TYPE_NULL,
    DJS_TYPE_BOOLEAN,
    DJS_TYPE_NUMBER,
    DJS_TYPE_STRING,
    DJS_TYPE_OBJECT,
    DJS_TYPE_SYMBOL
} DJSValueType;

typedef struct DJSRuntime
{
    size_t next_symbol_id;
} DJSRuntime;

typedef struct DJSValue
{
    DJSValueType type;
    union
    {
        bool boolean;
        double number;
        DJSObject *object;
        const DJSString *string;
        size_t symbol;
    } as;
} DJSValue;
typedef struct DJSPropertyKey
{
    enum
    {
        DJS_PROPERTY_KEY_STRING,
        DJS_PROPERTY_KEY_SYMBOL
    } type;
    union
    {
        const DJSString *string;
        size_t symbol;
    } as;
} DJSPropertyKey;

typedef struct DJSObjectEntry
{
    DJSPropertyKey key;
    DJSProperty *descriptor;
    struct DJSObjectEntry *next;
} DJSObjectEntry;
typedef struct DJSObjectVTable DJSObjectVTable;
typedef struct DJSObject
{
    DJSObject *NULLABLE prototype;
    DJSObjectEntry *properties;
    DJSObjectVTable *vtable;
    bool is_extensible;
} DJSObject;

typedef struct DJSString
{
    size_t length;
    char *chars;
} DJSString;

typedef uint8_t DJSPropertyFlags;
static const DJSPropertyFlags DJS_PROPERTY_WRITABLE = 1 << 0;
static const DJSPropertyFlags DJS_PROPERTY_ENUMERABLE = 1 << 1;
static const DJSPropertyFlags DJS_PROPERTY_CONFIGURABLE = 1 << 2;
static const DJSPropertyFlags DJS_PROPERTY_TYPE_MASK = 1 << 3;
typedef struct DJSProperty
{
    enum
    {
        DJS_PROPERTY_DATA,
        DJS_PROPERTY_ACCESSOR
    } type;
    DJSPropertyFlags flags;
    union
    {
        struct
        {
            DJSValue value;
            bool writable;
        } data;
        struct
        {
            NULLABLE DJSFunctionPtr getter;
            NULLABLE DJSFunctionPtr setter;
        } accessor;
    } as;
} DJSProperty;

typedef struct DJSObjectVTable
{
    DJSValue (*Call)(DJSRuntime *, DJSValue this, DJSValue *args, size_t argc);
    bool (*IsExtensible)(DJSRuntime *, DJSObject *);
    DJSProperty *NULLABLE (*GetOwnProperty)(DJSRuntime *, DJSObject *, DJSPropertyKey);
    bool (*DefineOwnProperty)(DJSRuntime *, DJSObject *, DJSPropertyKey, DJSProperty *);
    bool (*SetPrototypeOf)(DJSRuntime *, DJSObject *, DJSObject *);
    DJSObject *NULLABLE (*GetPrototypeOf)(DJSRuntime *,
                                          DJSObject *);
    DJSValue (*Get)(DJSRuntime *, DJSObject *, DJSPropertyKey, DJSValue receiver);
} DJSObjectVTable;

DJSRuntime *djs_new_runtime(void);
void djs_free_runtime(DJSRuntime *runtime);
DJSValue djs_object_new(DJSRuntime *runtime);
static inline DJSValue djs_undefined(void)
{
    return (DJSValue){.type = DJS_TYPE_UNDEFINED, .as = {.boolean = false}};
}
DJSValue djs_null(void);
DJSValue djs_bool(bool value);
DJSValue djs_true(void);
DJSValue djs_false(void);
DJSValue djs_number(double value);
DJSValue djs_function_new(DJSRuntime *, DJSFunctionPtr call);
DJSValue djs_string_new(DJSRuntime *, const char *str);

[[noreturn]]
static inline void djs_throw(DJSRuntime *UNUSED(runtime), DJSValue UNUSED(value))
{
    DJS_PANIC("Uncaught exception");
    exit(1);
}
DJSPropertyKey djs_property_key_from_string(const DJSString *string);
DJSProperty *djs_property_new_data(DJSRuntime *, DJSValue value);
static inline bool djs_property_is_configurable(const DJSProperty *property)
{
    return property->flags & DJS_PROPERTY_CONFIGURABLE;
}
bool djs_define_own_property(
    DJSRuntime *runtime,
    DJSObject *obj,
    DJSPropertyKey key,
    DJSProperty *descriptor);

DJSProperty *djs_property_from_value(DJSValue value);
DJSValue djs_property_as_value(DJSProperty *property);
static inline bool djs_property_is_data(const DJSProperty *property)
{
    return property->type == DJS_PROPERTY_DATA;
}
static inline bool djs_property_is_accessor(const DJSProperty *property)
{
    return property->type == DJS_PROPERTY_ACCESSOR;
}

#define DJS_ALLOC(runtime, T) \
    ((void)(runtime), GC_MALLOC(sizeof(T)))
