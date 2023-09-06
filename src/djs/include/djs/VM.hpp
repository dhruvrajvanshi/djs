#pragma once
#include "./CompletionRecord.hpp"
#include "./Function.hpp"
#include "./GCBase.hpp"
#include "./Instruction.hpp"
#include "./String.hpp"
#include "./Value.hpp"
#include <stack>

namespace djs {
class VM {
public:
  VM();
  auto execute(const Function &) -> ValueCompletionRecord;
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

    CallFrame &operator=(CallFrame &&that) noexcept {
      function = that.function;
      locals = std::move(that.locals);
      return *this;
    }

    CallFrame(CallFrame &&that) noexcept { *this = std::move(that); }
  };
  static_assert(!std::is_copy_assignable_v<CallFrame>);
  static_assert(!std::is_copy_constructible_v<CallFrame>);
  static_assert(std::is_move_constructible_v<CallFrame>);
  static_assert(std::is_move_assignable_v<CallFrame>);

  Vec<GCBase *> gc_roots;
  // Instructions are const, the pointer can be updated update
  const Instruction *instruction_pointer = nullptr;
  std::stack<CallFrame> call_stack;

  auto advance_instruction_pointer() -> Instruction;
  auto dispatch(Instruction) -> std::optional<ValueCompletionRecord>;

  auto run_gc() -> void;

public:
  // Abstract Operations
  // https://262.ecma-international.org/14.0/#sec-makebasicobject
  auto MakeBasicObject() -> Value;

  // End abstract operations

  auto make_string(StringLike auto s) -> Value {
    auto str = new String(s);
    gc_roots.push_back(str);
    return Value::string(str);
  }
};

} // namespace djs
