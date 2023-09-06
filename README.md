# Dhruv's JS Interpreter
I'm writing this JS interpreter for experimentation, but mostly for fun :)
This is hopelessly incomplete :^)

## Running tests
```sh
# Setup conan profile
conan profile detect --force

# Install dependencies
conan install . --output-folder=build --build=missing
conan install . --output-folder=build --build=missing -s build_type=Debug

# Configure
cmake -S . -B build --preset conan-default

# Build
cmake --build build --config Release

# Run tests
./build/test/Release/main_test

```
