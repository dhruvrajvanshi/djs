#pragma once
#include "./Completion.hpp"
#include "./Instruction.hpp"
#include "./Object.hpp"
#include "dlib/Vec.hpp"

#include <string>
#include <vector>

namespace djs {

struct BasicBlock {
  Vec<Instruction> instructions;
};
struct Function : public Object {
  Vec<BasicBlock> basic_blocks{};
  size_t local_count = 0;
  Function(Vec<BasicBlock> blocks, size_t local_count)
      : Object(function_slots()), basic_blocks(std::move(blocks)),
        local_count(local_count) {}

  Function() : Object(function_slots()){};

  auto Call(VM *, Value thisArg, Value arguments) -> Completion<Value>;

private:
  static auto function_slots() -> Slots {
    auto slots = Slots::ordinary();
    return slots;
  }
};

}; // namespace djs
