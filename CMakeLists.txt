cmake_minimum_required(VERSION 3.16)
project(TypeX VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Backend Server Executable
add_executable(typex_server backend/main.cpp)
target_include_directories(typex_server PRIVATE backend/include)

if(WIN32)
    target_link_libraries(typex_server PRIVATE ws2_32 iphlpapi)
else()
    target_link_libraries(typex_server PRIVATE pthread)
endif()
