#pragma once
#include "./Bytecode.hpp"
#include "./Common.hpp"

#include <string>
#include <vector>

namespace djs {

struct BasicBlock {
  std::vector<Instruction> instructions;
};
struct Function {
  std::vector<BasicBlock> basic_blocks;
  size_t local_count;
};

}; // namespace djs
