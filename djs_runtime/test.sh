#!/usr/bin/env bash
set -e

mkdir -p target

CC=gcc
CFLAGS="-Wall -fsanitize=undefined,address -std=c11 -g"

for SOURCE in `ls test_*.c`; do
  echo "TEST: $SOURCE"
  BASENAME=`basename $SOURCE`
  CMD="$CC $CFLAGS -o target/$BASENAME runtime.c $SOURCE"
  echo $CMD
  $CMD

  # Without MallocNanoZone, we get a warning when enabling the address
  # sanitizer:
  #  malloc: nano zone abandoned due to inability to reserve vm space.
  export MallocNanoZone='0'
  ./target/$BASENAME
done
