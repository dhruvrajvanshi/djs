#pragma once

#include "./value.h"
#include <stdio.h>

void DJSValue_print(FILE *file, DJSValue value);
void DJSValue_pretty_print(FILE *file, DJSValue value);
