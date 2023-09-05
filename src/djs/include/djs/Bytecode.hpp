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
public:
  template <IsOperand T> auto as() const -> T {
    if constexpr (std::is_same_v<T, Value>) {
      return static_cast<Value>(_o.value);
    } else if constexpr (std::is_same_v<T, RegisterIndex>) {
      return static_cast<RegisterIndex>(_o.reg);
    }
  }

private:
  const union _O {
    std::nullptr_t null;
    Value value;
    RegisterIndex reg;
  } _o;
  // These constructors enable implicit conversion from
  // raw values to Operands.
  // e.g.
  // Value value = ...
  // Operand value_operand = value
  // instead of
  // Operand value_operand = { .value = value }
  // This is required so that OPCODE_* macros in Instruction class
  // can initialize Opcodes without having to refer to the union labels.
  //
  // They're private, to avoid accidental conversion to
  // Operand
  Operand(std::nullptr_t v) : _o({.null = v}) {}
  Operand(Value v) : _o({.value = v}) {}
  Operand(RegisterIndex reg) : _o({.reg = reg}) {}
  // Instruction needs access to these implicit conversion constructors
  // because OPCODE_* macros rely on these conversions
  friend class Instruction;
};

struct Instruction {
#define OPCODE_1(name, arg1) name,
#define OPCODE_2(name, arg1, arg2) name,
  enum class Opcode { EACH_OPCODE(OPCODE_1, OPCODE_2) };
#undef OPCODE_1
#undef OPCODE_2

  const Opcode opcode;
  const Operand arg0;
  const Operand arg1;
  const Operand arg2;

  /// Generate Factory functions for constructing opcodes
  /// auto Bytecode::LoadValue(Value) -> Instruction
  /// ... and so on for each bytecode

#define GEN_FACTORY_1(op, arg_type)                                            \
  static Instruction op(arg_type value) {                                      \
    return {Opcode::op, value, nullptr, nullptr};                              \
  }
#define GEN_FACTORY_2(op, arg1_type, arg2_type)                                \
  static Instruction op(arg1_type arg1, arg2_type arg2) {                      \
    return {Opcode::op, arg1, arg2, nullptr};                                  \
  }

  EACH_OPCODE(GEN_FACTORY_1, GEN_FACTORY_2)
#undef GEN_FACTORY_1
#undef GEN_FACTORY_2
};

} // namespace djs

namespace std {
auto to_string(djs::Instruction::Opcode) -> std::string;
}
