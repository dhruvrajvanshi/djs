#pragma once
#include "./Bytecode.hpp"
#include "./Common.hpp"

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
