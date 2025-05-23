#!/usr/bin/env bash
set -e

mkdir -p target

CC=clang
CFLAGS="-Wall -fsanitize=undefined,address -L/opt/homebrew/lib -std=c11 -g -lgc -I/opt/homebrew/include"

RUNTIME_SOURCES="
  object.c
  print.c
  runtime.c 
"

for SOURCE in `ls test_*.c`; do
  echo "TEST: $SOURCE"
  BASENAME=`basename $SOURCE`
  CMD="$CC $CFLAGS -o target/$BASENAME $RUNTIME_SOURCES $SOURCE"
  echo $CMD
  $CMD

  # Without MallocNanoZone, we get a warning when enabling the address
  # sanitizer:
  #  malloc: nano zone abandoned due to inability to reserve vm space.
  export MallocNanoZone='0'
  ./target/$BASENAME
done
