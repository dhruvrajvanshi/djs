
#include "djs/syntax/ast.hpp"
#include <gtest/gtest.h>

using namespace djs;

TEST(Expression, CanConstructCallExpression) {
  auto location = SourceLocation{
      fs::path{},
      1,
  };
  CallExpression{location,
                 std::make_unique<Expression>(VarExpression(location, "foo")),
                 {}};
}

TEST(Expression, print) {
  auto location = SourceLocation{fs::path{}, 1};
  const Expression &expr = CallExpression{
      location,
      std::make_unique<Expression>(VarExpression(location, "foo")),
      {}};
  std::cout << expr;
}
