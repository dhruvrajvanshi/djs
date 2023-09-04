enable_testing()

find_package(Catch2 3 REQUIRED)

add_executable(
  main_test
  main_test.cc
)
target_link_libraries(
  main_test
  Catch2::Catch2WithMain
)
