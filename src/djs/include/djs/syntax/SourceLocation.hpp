#pragma once
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

namespace djs {

struct SourceLocation {
  fs::path path;
  uint32_t line;
};

} // namespace djs
