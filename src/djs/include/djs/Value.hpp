#include <cstdint>

namespace djs {
    class Value {
    private:
        enum class Kind {
            Undefined,
            Null
        };
        const Kind kind;
        const union As {
            // Void is not allowed here
            uint8_t undefined;
            uint8_t null;
        } as;

        template<typename T>
        Value(Kind kind, T as) : kind(kind), as(static_cast<As>(as)) {};

    public:
        static auto undefined() -> Value;
        auto is_undefined() const -> bool;

        static auto null() -> Value;
        auto is_null() const -> bool;
    };
}
