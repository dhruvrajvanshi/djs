#pragma once
namespace djs {
class VM;
class Value;
template <typename T> struct CompletionRecord;
using ValueCompletionRecord = CompletionRecord<Value>;
} // namespace djs
