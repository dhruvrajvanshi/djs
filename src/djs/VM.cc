#include "djs/VM.hpp"
#include "djs/Common.hpp"
#include "djs/CompletionRecord.hpp"
#include "djs/Opcodes.hpp"

namespace djs {

VM::VM() {}

auto VM::execute(const Function &function) -> CompletionRecord {
  assert<void>(function.basic_blocks.size() > 0, "Empty function");
  assert<void>(function.basic_blocks[0].instructions.size() > 0,
               "Empty BasicBlock");

  instruction_pointer = &function.basic_blocks[0].instructions[0];
  call_stack.push(CallFrame(&function));
  while (!call_stack.empty()) {
    auto instruction = advance_instruction_pointer();
    auto dispatch_result_opt = dispatch(instruction);

    if (dispatch_result_opt.has_value()) {
      auto completion = dispatch_result_opt.value();
      using K = CompletionRecord::Kind;
      switch (completion.kind()) {
      case K::Return: {
        if (call_stack.empty()) {
          return completion;
        }
        return panic<CompletionRecord>("Not implemented");
      }
      default:
        panic<CompletionRecord>("Not implemented");
      }
    }
  }

  return panic<CompletionRecord>("Not implemented");
}

auto VM::advance_instruction_pointer() -> Instruction {
  auto current = *instruction_pointer;
  instruction_pointer++;
  return current;
}

auto VM::dispatch(Instruction instruction) -> std::optional<CompletionRecord> {
  switch (instruction.opcode) {
  case Opcode::LoadValue: {
    auto destination = instruction.arg0.as<RegisterIndex>();
    auto value = instruction.arg1.as<Value>();
    auto &stack_frame = call_stack.top();
    auto &locals = stack_frame.locals;
    locals[destination] = value;
    assert<void>(this->call_stack.top().locals.size() > 0, "wat?");
    return {};
  } break;
  case Opcode::Return: {
    auto result_index = instruction.arg0.as<RegisterIndex>();
    auto &stack_frame = call_stack.top();
    assert<void>(stack_frame.locals.size() > result_index,
                 "Invalid local reference: " + std::to_string(result_index));
    auto result = stack_frame.locals[result_index];
    call_stack.pop();
    return CompletionRecord::ret(result);
  } break;
  default:
    return panic<Opt<CompletionRecord>>("Unhandled opcode: " +
                                        std::to_string(instruction.opcode));
  }
}

} // namespace djs
