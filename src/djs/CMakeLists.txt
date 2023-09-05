
add_library(
    djs
    Value.cc
    VM.cc
    Instruction.cc
    Object.cc
    GCBase.cc
)
target_include_directories(
    djs
    PUBLIC include
)
