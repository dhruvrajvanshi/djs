cmake_minimum_required(VERSION 3.27)
project(djs_runtime)

SET_PROPERTY(GLOBAL PROPERTY C_STANDARD 23)
enable_testing()

# Find the bdw-gc package
find_path(BDWGC_INCLUDE_DIR gc/gc.h
    PATHS /usr/local/include
    /opt/homebrew/include
    $ENV{HOMEBREW_PREFIX}/include
)

find_library(BDWGC_LIBRARY
    NAMES gc
    PATHS /usr/local/lib
    /opt/homebrew/lib
    $ENV{HOMEBREW_PREFIX}/lib
)

# Check if both include directory and library were found
if(BDWGC_INCLUDE_DIR AND BDWGC_LIBRARY)
    message(STATUS "Found bdw-gc: ${BDWGC_LIBRARY}")
else()
    message(FATAL_ERROR "bdw-gc library not found")
endif()

add_executable(test_object_get test_object_get.c runtime.c object.c print.c)
target_include_directories(test_object_get PRIVATE ${BDWGC_INCLUDE_DIR})
target_link_libraries(test_object_get PRIVATE ${BDWGC_LIBRARY})

add_test(NAME test_object_get COMMAND test_object_get)


