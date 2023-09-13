#pragma once
#include "./Traits.hpp"
#include <unordered_map>

namespace djs {

template <typename K, typename V>
  requires Hashable<K> && EqComparable<K, K>
using HashMap = std::unordered_map<K, V>;
} // namespace djs
