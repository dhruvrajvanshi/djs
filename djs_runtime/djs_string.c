#include "./djs_string.h"

bool djs_string_eq(const DJSString* left, const DJSString* right) {
  if (left->length != right->length) {
    return false;
  }
  return memcmp((void*)left->value, (void*)right->value, left->length) == 0;
}

const DJSString* djs_string_new(DJSRuntime* UNUSED(runtime), const char* cstr) {
  DJSString* string = GC_MALLOC_ATOMIC(sizeof(DJSString));
  string->length = strlen(cstr);
  const char* buffer = GC_MALLOC_ATOMIC(string->length + 1);
  memcpy((void*)buffer, cstr, string->length);
  string->value = buffer;
  return string;
}
