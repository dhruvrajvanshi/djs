
add_library(
    djs
    Array.cc
    GCBase.cc
    Function.cc
    Instruction.cc
    Object.cc
    OrdinaryObject.cc
    Value.cc
    VM.cc
)
target_include_directories(
    djs
    PUBLIC include
)
