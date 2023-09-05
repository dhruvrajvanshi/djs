#pragma once

#include "./Opcodes.hpp"
#include "./Value.hpp"
#include <string>
#include <type_traits>

namespace djs {
using RegisterIndex = size_t;

template <typename T>
concept IsOperand =
    std::is_same_v<T, Value> || std::is_same_v<T, RegisterIndex>;

/// @brief An instruction can have 0-2 Value, Register operands.
///        This class represents a common representation for these.
struct Operand {
  template <IsOperand T> auto as() const -> T {
    if constexpr (std::is_same_v<T, Value>) {
      return static_cast<Value>(_o.value);
    } else if constexpr (std::is_same_v<T, RegisterIndex>) {
      return static_cast<RegisterIndex>(_o.reg);
    }
  }

private:
  union _O {
    std::nullptr_t null;
    Value value;
    RegisterIndex reg;
  };
  _O _o;

  Operand(_O o) : _o(o) {}

  static auto make(std::nullptr_t v) -> Operand { return {{.null = v}}; }
  static auto make(Value v) -> Operand { return {{.value = v}}; }
  static auto make(RegisterIndex reg) -> Operand { return {{.reg = reg}}; }
  // because OPCODE_* macros rely on make functions
  friend class Instruction;
};
static_assert(IsCopyable<Operand>);
static_assert(IsMovable<Operand>);

struct Instruction {
#define OPCODE_1(name, arg1) name,
#define OPCODE_2(name, arg1, arg2) name,
  enum class Opcode { EACH_OPCODE(OPCODE_1, OPCODE_2) };
#undef OPCODE_1
#undef OPCODE_2

  Opcode opcode;
  Operand arg0;
  Operand arg1;
  Operand arg2;

  /// Generate Factory functions for constructing opcodes
  /// auto Bytecode::LoadValue(Value) -> Instruction
  /// ... and so on for each bytecode

#define GEN_FACTORY_1(op, arg_type)                                            \
  static Instruction op(arg_type value) {                                      \
    return {Opcode::op, Operand::make(value), Operand::make(nullptr),          \
            Operand::make(nullptr)};                                           \
  }
#define GEN_FACTORY_2(op, arg1_type, arg2_type)                                \
  static Instruction op(arg1_type arg1, arg2_type arg2) {                      \
    return {Opcode::op, Operand::make(arg1), Operand::make(arg2),              \
            Operand::make(nullptr)};                                           \
  }

  EACH_OPCODE(GEN_FACTORY_1, GEN_FACTORY_2)
#undef GEN_FACTORY_1
#undef GEN_FACTORY_2
};
static_assert(IsCopyable<Instruction>);
static_assert(IsMovable<Instruction>);

using Opcode = Instruction::Opcode;

} // namespace djs

namespace std {
auto to_string(djs::Instruction::Opcode) -> std::string;
}
