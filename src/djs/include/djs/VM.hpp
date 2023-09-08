#pragma once
#include "./Completion.hpp"
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
  struct ExecutionContext {
    const Function *function;
    Vec<Value> locals;

    explicit ExecutionContext(const Function *function) : function(function) {
      locals = Vec<Value>();
      locals.reserve(function->local_count);
      locals.assign(function->local_count, Value::undefined());
    }

    ExecutionContext &operator=(ExecutionContext &&that) noexcept {
      function = that.function;
      locals = std::move(that.locals);
      return *this;
    }

    ExecutionContext(ExecutionContext &&that) noexcept {
      *this = std::move(that);
    }
  };
  static_assert(!std::is_copy_assignable_v<ExecutionContext>);
  static_assert(!std::is_copy_constructible_v<ExecutionContext>);
  static_assert(std::is_move_constructible_v<ExecutionContext>);
  static_assert(std::is_move_assignable_v<ExecutionContext>);

  Vec<GCBase *> gc_roots;
  // Instructions are const, the pointer can be updated update
  const Instruction *instruction_pointer = nullptr;
  std::stack<ExecutionContext> call_stack;

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

  auto make_array() -> Value;

private:
  template <typename T = Object>
    requires std::is_assignable_v<Object, T>
  auto make_basic_object() -> T *;
};

} // namespace djs
