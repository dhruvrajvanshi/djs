enable_testing()

find_package(Catch2 3 REQUIRED)

add_executable(
  main_test
  main_test.cc
)
target_link_libraries(
  main_test
  Catch2::Catch2WithMain
  djs
)

if(MSVC)
else()
  target_compile_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=leak)
  target_link_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=leak)
endif()
