#pragma once
#include "./GCBase.hpp"
#include <string>

namespace djs {

struct String : public GCBase {
  std::string contents;

  String(StringLike auto contents) : contents(std::move(contents)) {}
  ~String() {}
};

} // namespace djs
