#include "djs/Instruction.hpp"

auto std::to_string(djs::Instruction::Opcode opcode) -> std::string {
  using O = djs::Instruction::Opcode;
#define GEN_CASE(n, ...)                                                       \
  case O::n:                                                                   \
    return #n;

  switch (opcode) { EACH_OPCODE(GEN_CASE, GEN_CASE) }

#undef GEN_CASE
}
