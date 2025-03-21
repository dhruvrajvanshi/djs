#pragma once

#include <stdio.h>
#include "./value.h"

void DJSValue_print(FILE* file, DJSValue value);
void DJSValue_pretty_print(FILE* file, DJSValue value);
