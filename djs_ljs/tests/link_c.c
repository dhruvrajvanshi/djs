#include <stdlib.h>
struct Box {
    const char* message;
};

struct Box* box_new() {
    struct Box* box= malloc(sizeof(struct Box));
    box->message = "PASS";
    return box;
}

void box_free(struct Box* box) {
    free(box);
}
