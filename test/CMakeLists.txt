Include(FetchContent)

FetchContent_Declare(
  Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG        v3.4.0)

FetchContent_MakeAvailable(Catch2)

add_executable(
  main_test
  main_test.cc
  array_test.cc
  object_test.cc
)
target_link_libraries(main_test PRIVATE Catch2::Catch2WithMain djs)

enable_testing()

add_test(
  NAME main_test
  COMMAND $<TARGET_FILE:main_test> --success
)

if(MSVC)
else()
  target_compile_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=leak -fsanitize=address)
  target_link_options(main_test PRIVATE  -fsanitize=undefined -fsanitize=leak -fsanitize=address)
endif()
