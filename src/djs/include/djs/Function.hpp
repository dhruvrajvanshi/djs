#pragma once
#include "./Common.hpp"
#include "./Instruction.hpp"

#include <string>
#include <vector>

namespace djs {

struct BasicBlock {
  Vec<Instruction> instructions;
};
struct Function {
  Vec<BasicBlock> basic_blocks;
  size_t local_count;
};

}; // namespace djs
