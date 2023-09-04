enable_testing()

find_package(Catch2 3 REQUIRED)

add_executable(
  hello_test
  hello_test.cc
)
target_link_libraries(
  hello_test
  Catch2::Catch2WithMain
)
