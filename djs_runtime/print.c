#include "./print.h"
#include "value.h"
#include <stdio.h>

void DJSString_print(FILE *file, const DJSString *str) {
  for (size_t i = 0; i < str->length; i++) {
    fputc(str->value[i], file);
  }
}

void DJSValue_print(FILE *file, DJSValue value) {
  switch (value.type) {
  case DJS_TYPE_UNDEFINED:
    fprintf(file, "undefined");
    break;
  case DJS_TYPE_NULL:
    fprintf(file, "null");
    break;
  case DJS_TYPE_BOOLEAN:
    if (value.as.boolean) {
      fprintf(file, "true");
    } else {
      fprintf(file, "false");
    }
    break;
  case DJS_TYPE_NUMBER:
    fprintf(file, "%f", value.as.number);
    break;
  case DJS_TYPE_OBJECT:
    fprintf(file, "[object: Object]");
    break;
  case DJS_TYPE_STRING:
    DJSString_print(file, value.as.string);
    break;
  case DJS_TYPE_SYMBOL:
    fprintf(file, "[symbol: %zu]", value.as.symbol.id);
    break;
  }
}

void DJSValue_pretty_print(FILE *file, DJSValue value) {
  switch (value.type) {
  case DJS_TYPE_UNDEFINED:
    fprintf(file, "undefined");
    break;
  case DJS_TYPE_NULL:
    fprintf(file, "null");
    break;
  case DJS_TYPE_BOOLEAN:
    if (value.as.boolean) {
      fprintf(file, "true");
    } else {
      fprintf(file, "false");
    }
    break;
  case DJS_TYPE_NUMBER:
    fprintf(file, "%f", value.as.number);
    break;
  case DJS_TYPE_OBJECT:
    fprintf(file, "[object: Object]");
    break;
  case DJS_TYPE_STRING:
    fprintf(file, "\"");
    DJSString_print(file, value.as.string);
    fprintf(file, "\"");
    break;
  case DJS_TYPE_SYMBOL:
    fprintf(file, "[symbol: %zu]", value.as.symbol.id);
    break;
  }
}
