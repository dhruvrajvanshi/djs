#pragma once
#include "./SourceLocation.hpp"
namespace djs {

struct ParseNode {
  SourceLocation location;
  ParseNode(SourceLocation location) : location(location){};
  virtual ~ParseNode(){};
};

}; // namespace djs
