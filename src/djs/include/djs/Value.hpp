#pragma once

#include <cstdint>
#include <functional>
#include <span>
#include <djs/Forward.hpp>

namespace djs {
    enum class ValueKind {
        Undefined,
        Null,
        NativeFunction,
    };
    using NativeFunction = CompletionRecord(*)(VM&, std::span<Value>);

    class Value {

    private:
        using Kind = ValueKind;
        const Kind kind;
        const union As {
            // Void is not allowed here
            uint8_t undefined;
            uint8_t null;
            NativeFunction native_function;
        } as;

        template<typename T>
        Value(Kind kind, T as) : kind(kind), as(static_cast<As>(as)) {};
        Value(NativeFunction as) : kind(Kind::NativeFunction), as({ .native_function = as }) {};

    public:


        static auto undefined() -> Value;
        auto is_undefined() const -> bool;

        static auto null() -> Value;
        auto is_null() const -> bool;

        static auto native_function(NativeFunction f) -> Value {
            return { f };
        }
    };
}
