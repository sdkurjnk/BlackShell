cmake_minimum_required(VERSION 3.20)
# C enabled alongside CXX: macOS Homebrew LLVM's LLVMConfig runs FindLibEdit,
# which check_include_file(histedit.h) compiles a .c probe — fails if C is off.
project(blackshell_engine C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Self-contained pipeline (#15): embed Clang (frontend) + LLVM (backend) so the
# shipped engine needs no clang/llc on the user's machine. find_package resolves
# the libraries and their transitive link order — the reason this project uses
# CMake over a flat llvm-config line.
find_package(LLVM REQUIRED CONFIG)
find_package(Clang REQUIRED CONFIG)
message(STATUS "Found LLVM ${LLVM_PACKAGE_VERSION} at ${LLVM_DIR} (dylib=${LLVM_LINK_LLVM_DYLIB})")

# Prefer static archives (self-contained binary, no libLLVM/libclang at runtime).
# Where the install only ships the aggregate dylib (e.g. MSYS2: LLVM_LINK_LLVM_DYLIB
# ON), fall back to it and ship the shared lib alongside — mixing the two causes
# duplicate-symbol link errors.
if(LLVM_LINK_LLVM_DYLIB)
  set(ENGINE_LLVM_LIBS LLVM)
  set(ENGINE_CLANG_LIBS clang-cpp)
else()
  llvm_map_components_to_libnames(ENGINE_LLVM_LIBS
    native core support codegen target mc irreader analysis)
  set(ENGINE_CLANG_LIBS clangCodeGen clangFrontend clangBasic)
endif()

# LLVM ships its required macros as raw -D flags; add_definitions takes them raw
# (target_compile_definitions would mangle the -D prefix and =values).
separate_arguments(LLVM_DEFINITIONS_LIST NATIVE_COMMAND "${LLVM_DEFINITIONS}")
add_definitions(${LLVM_DEFINITIONS_LIST})

# Binaries land directly in build/ so the npm scripts and test wrapper find them.
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

# The orthogonal primitives (one TU each) shared by the engine and its unit test.
add_library(engine_core STATIC
  src/engine/driver.cpp
  src/engine/frontend.cpp
  src/engine/gate.cpp
  src/engine/noising.cpp
  src/engine/harness.cpp
  src/engine/backend.cpp)
target_include_directories(engine_core SYSTEM PUBLIC ${LLVM_INCLUDE_DIRS} ${CLANG_INCLUDE_DIRS})
target_include_directories(engine_core PUBLIC src/engine)
target_link_libraries(engine_core PUBLIC ${ENGINE_CLANG_LIBS} ${ENGINE_LLVM_LIBS})

add_executable(blackshell-engine src/engine/main.cpp)
target_link_libraries(blackshell-engine PRIVATE engine_core)

# publish.yml bundles the LLVM/clang shared libs next to the engine, so make the
# binary search beside itself: $ORIGIN on ELF, @loader_path on Mach-O (Windows
# finds sibling DLLs with no rpath). Harmless locally — just an extra search path.
if(APPLE)
  set_target_properties(blackshell-engine PROPERTIES BUILD_RPATH "@loader_path")
elseif(UNIX)
  set_target_properties(blackshell-engine PROPERTIES BUILD_RPATH "$ORIGIN")
endif()

add_executable(blackshell-engine-test test/engine/engine_test.cpp)
target_link_libraries(blackshell-engine-test PRIVATE engine_core)
