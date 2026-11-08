cmake_minimum_required(VERSION 3.16)
project(TypeX VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Backend server (headless API + static frontend host). Desktop launching on
# Windows is handled by the Electron shell in desktop/.
add_executable(typex_server
    backend/main.cpp
    backend/include/sqlite3.c
)
target_include_directories(typex_server PRIVATE backend/include)

if(WIN32)
    # NOMINMAX stops <windows.h> from defining min/max as macros, which would
    # otherwise break every std::min/std::max call in the backend headers.
    target_compile_definitions(typex_server PRIVATE _WIN32_WINNT=0x0A00 NOMINMAX)
    target_link_libraries(typex_server PRIVATE ws2_32 iphlpapi advapi32 user32)
    if(MSVC)
        target_compile_options(typex_server PRIVATE /O2)
    endif()
else()
    target_link_libraries(typex_server PRIVATE pthread dl)
endif()
