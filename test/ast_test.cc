
#include "djs/syntax/ast.hpp"
#include "dlib/Box.hpp"

#include <gtest/gtest.h>

using namespace djs;

TEST(Expression, CanConstructCallExpression) {
  auto location = SourceLocation{
      fs::path{},
      1,
  };
  CallExpression{
      location, make_box<Expression>(VarExpression(location, "foo")), {}};
}

TEST(Expression, print) {
  auto location = SourceLocation{fs::path{}, 1};
  const Expression &expr = CallExpression{
      location, make_box<Expression>(VarExpression(location, "foo")), {}};
  std::cout << expr;
}
