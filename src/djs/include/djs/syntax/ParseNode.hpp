#pragma once
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
  ParseNode(SourceLocation location) : location(location){};
  virtual ~ParseNode(){};
};

}; // namespace djs
