#include "djs/Function.hpp"
#include "djs/Completion.hpp"
#include "djs/VM.hpp"
namespace djs {

auto Function::Call(VM *vm, Value thisArg, Value args) -> Completion<Value> {
  return vm->execute(*this, thisArg, args);
}

} // namespace djs
