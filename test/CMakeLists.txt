Include(FetchContent)
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.14.0)
FetchContent_MakeAvailable(googletest)
add_executable(
  main_test
  main_test.cc
  array_test.cc
  object_test.cc
)
target_link_libraries(main_test PRIVATE djs GTest::gtest_main)
include(GoogleTest)

gtest_discover_tests(main_test)

if(MSVC)
else()
  target_compile_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=leak -fsanitize=address)
  target_link_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=leak -fsanitize=address)
endif()
