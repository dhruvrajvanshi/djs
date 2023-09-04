#pragma once

#include "./Value.hpp"

namespace djs {
    using RegisterIndex = size_t;

    /// @brief An instruction can have 0-2 Value, Register operands.
    ///        This class represents a common representation for these.
    struct Operand {
    public:
        auto as_value() const -> Value {
            return _o.value;
        }
        auto as_register_index() const -> RegisterIndex {
            return _o.reg;
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
        Operand(std::nullptr_t v): _o({ .null = v }) {}
        Operand(Value v): _o({ .value = v }) {}
        Operand(RegisterIndex reg): _o({ .reg = reg }) {}
        // Instruction needs access to these implicit conversion constructors
        // because OPCODE_* macros rely on these conversions
        friend class Instruction;
    };

    struct Instruction {
        enum class Opcode {
            LoadValue,
            Plus,
        };

        const Opcode opcode;
        const RegisterIndex destination;
        const Operand arg1;
        const Operand arg2;

        /// Factory functions for constructing opcodes
        #define OPCODE_1(name, op, arg_type) \
            static Instruction [[clang::mustuse]] ##name(RegisterIndex destination, arg_type value) { \
            return { \
                Opcode::##op, \
                destination, \
                value, \
                nullptr \
            }; \
        }
        #define OPCODE_2(name, op, arg1_type, arg2_type) \
            static Instruction [[clang::mustuse]] ##name(RegisterIndex destination, arg1_type arg1, arg2_type arg2) { \
            return { \
                Opcode::##op, \
                destination, \
                arg1, \
                arg2 \
            }; \
        }

        OPCODE_1(load_value, LoadValue, Value)
        OPCODE_2(plus, Plus, RegisterIndex, RegisterIndex)

        #undef OPCODE_1
    };


} // namespace djs
