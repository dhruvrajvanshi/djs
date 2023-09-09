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
  common_test.cc
  function_test.cc
  object_test.cc
)
target_link_libraries(main_test PRIVATE djs GTest::gtest_main)
include(GoogleTest)

gtest_discover_tests(main_test)

if(MSVC)
else()
  target_compile_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=address)
  target_link_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=address)
endif()

include(CheckCXXCompilerFlag)
check_cxx_compiler_flag(-fsanitize=leak HAS_FSANITIZE_LEAK)

if(HAS_FSANITIZE_LEAK)
  target_compile_options(main_test PRIVATE  -fsanitize=leak)
  target_link_options(main_test PRIVATE  -fsanitize=leak)
endif()
