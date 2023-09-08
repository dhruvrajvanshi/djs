#pragma once
#include "./Common.hpp"
#include "./Instruction.hpp"
#include "./Object.hpp"

#include <string>
#include <vector>

namespace djs {

struct BasicBlock {
  Vec<Instruction> instructions;
};
struct Function : Object {
  Vec<BasicBlock> basic_blocks;
  size_t local_count;
  Function(Vec<BasicBlock> blocks, size_t local_count)
      : Object(function_slots()), basic_blocks(std::move(blocks)),
        local_count(local_count) {}

private:
  static auto function_slots() -> Slots {
    auto slots = Slots::ordinary();
    return slots;
  }
};

}; // namespace djs
