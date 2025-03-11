#pragma once

#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#ifdef __GNUC__
#define UNUSED(x) UNUSED_##x __attribute__((__unused__))
#else
#define UNUSED(x) UNUSED_##x
#endif

#ifdef __GNUC__
#define UNUSED_FUNCTION(x) __attribute__((__unused__)) UNUSED_##x
#else
#define UNUSED_FUNCTION(x) UNUSED_##x
#endif

#ifdef __GNUC__
#define auto __auto_type
#else
#error "auto is not supported"
#endif

typedef enum DJSObjectType {
  DJS_OBJECT_STRING,
  DJS_OBJECT_INSTANCE,
} DJSObjectType;

typedef struct DJSObject DJSObject;

typedef enum DJSValueType {
  DJS_TYPE_UNDEFINED,
  DJS_TYPE_NULL,
  DJS_TYPE_BOOLEAN,
  DJS_TYPE_NUMBER,
  DJS_TYPE_OBJECT,
} DJSValueType;

typedef struct DJSValue {
  DJSValueType type;
  union {
    bool undefined;
    bool null;
    bool boolean;
    double number;
    DJSObject *object;
  } as;
} DJSValue;

typedef struct DJSObjectEntry DJSObjectEntry;

typedef struct DJSObjectEntry {
  DJSObject *key;
  DJSValue value;
  DJSObjectEntry *next;
} DJSObjectEntry;

typedef struct DJSObject {
  DJSObjectType type;
  DJSObjectEntry *properties;
} DJSObject;

typedef struct DJSInstance {
  DJSObject obj;
} DJSInstance;

typedef struct DJSString {
  DJSObject obj;
  size_t length;
  const char *value;
} DJSString;

typedef struct DJSCompletion {
  DJSValue value;
  bool abrupt;
} DJSCompletion;

#define DJS_PANIC(msg)                                                         \
  do {                                                                         \
    fprintf(stderr, "PANIC at %s:%d in function %s: %s\n", __FILE__, __LINE__, \
            __FUNCTION__, msg);                                                \
    exit(1);                                                                   \
  } while (0)
#define DJS_TODO()                                                             \
  do {                                                                         \
    fprintf(stderr, "TODO at %s:%d in function %s\n", __FILE__, __LINE__,      \
            __FUNCTION__);                                                     \
    exit(1);                                                                   \
  } while (0)

typedef struct DJSRuntime DJSRuntime;
DJSRuntime *djs_new_runtime(void);
void djs_free_runtime(DJSRuntime *);

#define DJS_OBJECT_AS_VALUE(obj)                                               \
  ((DJSValue){.type = DJS_TYPE_OBJECT, .as = {.object = (DJSObject *)obj}})

DJSInstance *djs_new_instance(DJSRuntime *);
DJSString *djs_new_string(DJSRuntime *, const char *value);

DJSCompletion djs_object_set(DJSRuntime *, DJSObject *obj, DJSString *key,
                             DJSValue value);

DJSCompletion djs_object_get(DJSRuntime *, DJSObject *obj, DJSString *key);

bool djs_eqeqeq(DJSValue left, DJSValue right);

void djs_console_log(DJSRuntime *, DJSValue value);
