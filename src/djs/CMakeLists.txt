
add_library(
    djs
    Value.cc
    VM.cc
    Bytecode.cc
)
target_include_directories(
    djs
    PUBLIC include
)
