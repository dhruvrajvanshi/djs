#pragma once
#include "./Bytecode.hpp"
#include "./Common.hpp"

#include <string>
#include <vector>

namespace djs {

struct BasicBlock {
  const std::vector<Instruction> instructions;
  NOCOPY(BasicBlock)
};
struct Function {
  const std::vector<BasicBlock> basic_blocks;
  NOCOPY(Function)
};

}; // namespace djs
