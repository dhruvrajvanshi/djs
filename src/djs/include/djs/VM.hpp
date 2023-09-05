#pragma once
#include "./CompletionRecord.hpp"
#include "./Function.hpp"
#include "./Instruction.hpp"
#include "./Value.hpp"
#include <stack>

namespace djs {
class VM {
public:
  VM();
  auto execute(const Function &) -> CompletionRecord;
  ~VM();

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
  Vec<Value> gc_roots;
  // Instructions are const, the pointer can be updated update
  const Instruction *instruction_pointer = nullptr;
  std::stack<CallFrame> call_stack;

  auto advance_instruction_pointer() -> Instruction;
  auto dispatch(Instruction) -> std::optional<CompletionRecord>;

  auto run_gc() -> void;

public:
  // Abstract Operations
  // https://262.ecma-international.org/14.0/#sec-makebasicobject
  auto MakeBasicObject() -> Value;
};

} // namespace djs
