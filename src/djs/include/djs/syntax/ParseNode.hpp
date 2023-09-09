#pragma once
#include "../Common.hpp"
#include <filesystem>
#include <string>

namespace fs = std::filesystem;
namespace djs {
struct SourceLocation {
  fs::path path;
  uint32_t line;
};

struct ParseNode {
  SourceLocation location;
};

}; // namespace djs
