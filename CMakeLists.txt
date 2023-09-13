cmake_minimum_required(VERSION 3.15)
project(simplejs C CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_EXPORT_COMPILE_COMMANDS true)

enable_testing()

if(MSVC)
  add_compile_options(/W4)
else()
  add_compile_options(-Wall -Werror)
endif()

add_subdirectory(test)
add_subdirectory(src)
