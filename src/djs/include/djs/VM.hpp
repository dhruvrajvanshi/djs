#pragma once
#include "./Bytecode.hpp"
#include "./CompletionRecord.hpp"
#include "./Function.hpp"
#include "./Value.hpp"
#include <stack>

namespace djs {
class VM {
public:
  VM();
  auto execute(const Function &) -> CompletionRecord;

private:
  struct CallFrame {
    const Function *function;
    Vec<Value> locals;

    explicit CallFrame(const Function *function) : function(function) {
      locals = Vec<Value>();
      locals.reserve(function->local_count);
      locals.assign(function->local_count, Value::undefined());
    }

    CallFrame &operator=(CallFrame &that) {
      function = that.function;
      locals = std::move(that.locals);
      return *this;
    }
  };
  // Instructions are const, the pointer can be updated update
  const Instruction *instruction_pointer = nullptr;
  std::stack<CallFrame> call_stack;

  auto advance_instruction_pointer() -> Instruction;
  auto dispatch(Instruction) -> std::optional<CompletionRecord>;
};

} // namespace djs
