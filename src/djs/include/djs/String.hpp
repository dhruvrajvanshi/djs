#pragma once
#include "./GCBase.hpp"
#include "dlib/Traits.hpp"
#include <string>

namespace djs {

struct String : public GCBase {
  String(StringLike auto contents) : contents(std::move(contents)) {}
  ~String() {}

  auto text() -> std::string_view { return std::string_view(contents); }

private:
  std::string contents;
};

} // namespace djs
