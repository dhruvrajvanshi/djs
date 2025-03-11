#include "./print.h"
#include "./runtime.h"

void DJSString_print(FILE *file, const DJSString *str) {
  for (size_t i = 0; i < str->length; i++) {
    fputc(str->value[i], file);
  }
}

void DJSValue_print(FILE *file, const DJSValue *value) {
  switch (value->type) {
  case DJS_TYPE_UNDEFINED:
    fprintf(file, "undefined");
    break;
  case DJS_TYPE_NULL:
    fprintf(file, "null");
    break;
  case DJS_TYPE_BOOLEAN:
    if (value->as.boolean) {
      fprintf(file, "true");
    } else {
      fprintf(file, "false");
    }
    break;
  case DJS_TYPE_NUMBER:
    fprintf(file, "%f", value->as.number);
    break;
  case DJS_TYPE_OBJECT:
    switch (value->as.object->type) {
    case DJS_OBJECT_STRING:
      DJSString_print(file, (DJSString *)(value->as.object));
      break;
    default:
      fprintf(file, "[object: Object]");
    }
    break;
  }
}
