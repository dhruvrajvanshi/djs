#pragma once

/**
 * @brief Helper macro for generating code for each opcode
 * For each opcode with 1 argument, this macro runs OPCODE_1 macro,
 * for opcodes with 2 args, OPCODE_2, and so on
 * The first argument to OPCODE_* callback macros is the name of the
 * Opcode, the rest are argument types.
 *
 *
 * @example
    #define OPCODE_1(arg, op_type_1) case Opcode::arg: return #arg;
    #define OPCODE_2(arg, op_type_1, op_type_2) case Opcode::arg: return #arg;
    auto opcode_name(Opcode opcode) -> const char* {
        switch (opcode) {
            EACH_OPCODE(OPCODE_1, OPCODE_2)
        }
    }
    #undef OPCODE_1
    #undef OPCODE_2

    // Generates
    auto opcode_name(Opcode opcode) -> const char* {
        switch(opcode) {
            case Opcode::LoadValue: return "LoadValue"
            case Opcode::Plus: return "Plus"
            // and so on
        }
    }
 */
#define EACH_OPCODE(OPCODE_1, OPCODE_2)                                        \
  OPCODE_2(LoadValue, RegisterIndex, Value)                                    \
  OPCODE_1(Return, RegisterIndex)
