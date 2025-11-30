#include <stdio.h>

extern FILE* get_stdin() {
    return stdin;
}
extern FILE* get_stdout() {
    return stdout;
}
extern FILE* get_stderr() {
    return stderr;
}
