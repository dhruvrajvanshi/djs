
add_library(
    djs
    Value.cc
    VM.cc
    Instruction.cc
    Object.cc
    GCBase.cc
    OrdinaryObject.cc
)
target_include_directories(
    djs
    PUBLIC include
)
