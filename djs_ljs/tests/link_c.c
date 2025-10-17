#include <stdlib.h>
struct Box {
  const char *message;
};

struct Box *box_new() {
  struct Box *box = malloc(sizeof(struct Box));
  box->message = "PASS";
  return box;
}

const char *box_message(const struct Box *box) { return box->message; }

void box_free(struct Box *box) { free(box); }
