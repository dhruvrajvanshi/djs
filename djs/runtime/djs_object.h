#pragma once
#define FOR_EACH_ENTRY(obj, entry) \
  for (DJSObjectEntry* entry = obj->properties; entry; entry = entry->next)
