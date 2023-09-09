#include "djs/Common.hpp"
#include <gtest/gtest.h>

TEST(to_string, CanStringifyVec) {
  auto vec = std::vector{1, 2, 3};
  ASSERT_EQ("{1, 2, 3}", std::to_string(vec));
}

TEST(to_string, CanStringifyOpt) {
  auto opt = std::make_optional(1);
  ASSERT_EQ("1", std::to_string(opt));

  opt = std::nullopt;
  ASSERT_EQ("null", std::to_string(opt));
}

TEST(to_string, CanStringifyUniquePtr) {
  auto u = std::make_unique<int>(1);
  ASSERT_EQ("1", std::to_string(u));
}
