conan install . --output-folder=build --build=missing -s build_type=Debug

# Configure
cmake -S . -B build --preset conan-default
