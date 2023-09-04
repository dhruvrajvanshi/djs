cmake_minimum_required(VERSION 3.15)
project(simplejs C CXX)

set(CMAKE_CXX_STANDARD 23)

add_executable(${PROJECT_NAME} src/main.c)
add_subdirectory(test)
