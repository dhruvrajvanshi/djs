#pragma once
namespace djs {
class VM;
class Value;
template <typename T> struct Completion;
using ValueCompletionRecord = Completion<Value>;
} // namespace djs
