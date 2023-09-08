#include "djs/VM.hpp"
#include "djs/Array.hpp"
#include "djs/Common.hpp"
#include "djs/Completion.hpp"
#include "djs/Object.hpp"
#include "djs/Opcodes.hpp"

namespace djs {

VM::VM() {}

auto VM::execute(const Function &function) -> ValueCompletionRecord {
  ASSERT(function.basic_blocks.size() > 0, "Empty function");
  ASSERT(function.basic_blocks[0].instructions.size() > 0, "Empty BasicBlock");

  instruction_pointer = &function.basic_blocks[0].instructions[0];
  call_stack.push(ExecutionContext(&function));
  while (!call_stack.empty()) {
    auto instruction = advance_instruction_pointer();
    auto dispatch_result_opt = dispatch(instruction);

    if (dispatch_result_opt.has_value()) {
      auto completion = dispatch_result_opt.value();
      using K = ValueCompletionRecord::Kind;
      switch (completion.kind()) {
      case K::Return: {
        if (call_stack.empty()) {
          return completion;
        }
        PANIC("Not implemented");
      }
      default:
        PANIC("Not implemented");
      }
    }
  }

  PANIC("Not implemented");
}

auto VM::advance_instruction_pointer() -> Instruction {
  auto current = *instruction_pointer;
  instruction_pointer++;
  return current;
}

auto VM::dispatch(Instruction instruction)
    -> std::optional<ValueCompletionRecord> {
  switch (instruction.opcode) {
  case Opcode::LoadValue: {
    auto destination = instruction.arg0.as<RegisterIndex>();
    auto value = instruction.arg1.as<Value>();
    auto &stack_frame = call_stack.top();
    auto &locals = stack_frame.locals;
    locals[destination] = value;
    ASSERT(this->call_stack.top().locals.size() > 0, "wat?");
    return {};
  } break;
  case Opcode::Return: {
    auto result_index = instruction.arg0.as<RegisterIndex>();
    auto &stack_frame = call_stack.top();
    ASSERT(stack_frame.locals.size() > result_index,
           "Invalid local reference: " + std::to_string(result_index));
    auto result = stack_frame.locals[result_index];
    call_stack.pop();
    return ValueCompletionRecord::ret(result);
  } break;
  default:
    PANIC("Unhandled opcode: " + std::to_string(instruction.opcode));
  }
}

template <typename T>
  requires std::is_assignable_v<Object, T>
auto VM::make_basic_object() -> T * {
  auto obj = new T(Object::Slots::ordinary());
  gc_roots.push_back(obj);
  return obj;
}

auto VM::MakeBasicObject() -> Value {
  return Value::object(make_basic_object<Object>());
}

auto VM::make_array() -> Value {
  auto obj = VM::make_basic_object<Array>();
  return Value::object(obj);
}

auto VM::run_gc() -> void {
  for (auto obj : gc_roots) {
    delete obj;
  }
}

VM::~VM() { run_gc(); }

} // namespace djs
