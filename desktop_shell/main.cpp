#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <thread>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/prctl.h>
#include <dlfcn.h>

namespace {

pid_t g_backend_pid = -1;
pid_t g_gui_pid = -1;

void kill_all_child_processes() {
    if (g_gui_pid > 0) {
        kill(g_gui_pid, SIGTERM);
        int status;
        for (int i = 0; i < 10; ++i) {
            pid_t r = waitpid(g_gui_pid, &status, WNOHANG);
            if (r == g_gui_pid) break;
            usleep(20000); // 20ms
        }
        kill(g_gui_pid, SIGKILL);
        waitpid(g_gui_pid, &status, 0);
        g_gui_pid = -1;
    }
    if (g_backend_pid > 0) {
        std::cout << "[typex-app] Shutting down backend child process (PID " << g_backend_pid << ")..." << std::endl;
        kill(g_backend_pid, SIGTERM);
        int status;
        for (int i = 0; i < 20; ++i) {
            pid_t r = waitpid(g_backend_pid, &status, WNOHANG);
            if (r == g_backend_pid) {
                g_backend_pid = -1;
                return;
            }
            usleep(50000); // 50ms
        }
        kill(g_backend_pid, SIGKILL);
        waitpid(g_backend_pid, &status, 0);
        g_backend_pid = -1;
    }
}

void signal_handler(int sig) {
    (void)sig;
    kill_all_child_processes();
    _exit(0);
}

// Find a free TCP port by letting the OS bind to port 0
int find_free_port() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return 8080;

    struct sockaddr_in serv_addr;
    std::memset(&serv_addr, 0, sizeof(serv_addr));
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    serv_addr.sin_port = 0; // OS chooses free port

    if (bind(sock, (struct sockaddr*)&serv_addr, sizeof(serv_addr)) < 0) {
        close(sock);
        return 8080;
    }

    socklen_t addrlen = sizeof(serv_addr);
    if (getsockname(sock, (struct sockaddr*)&serv_addr, &addrlen) < 0) {
        close(sock);
        return 8080;
    }

    int port = ntohs(serv_addr.sin_port);
    close(sock);
    return port;
}

bool check_health(int port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return false;

    // Set non-blocking for fast connect test
    fcntl(sock, F_SETFL, O_NONBLOCK);

    struct sockaddr_in serv_addr;
    std::memset(&serv_addr, 0, sizeof(serv_addr));
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    serv_addr.sin_port = htons(port);

    connect(sock, (struct sockaddr*)&serv_addr, sizeof(serv_addr));

    fd_set fdset;
    FD_ZERO(&fdset);
    FD_SET(sock, &fdset);
    struct timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 100000; // 100ms

    int res = select(sock + 1, nullptr, &fdset, nullptr, &tv);
    if (res > 0) {
        int so_error = 0;
        socklen_t len = sizeof(so_error);
        getsockopt(sock, SOL_SOCKET, SO_ERROR, &so_error, &len);
        close(sock);
        return (so_error == 0);
    }

    close(sock);
    return false;
}

// Single instance check via unix domain socket
int check_single_instance(const std::string& app_id) {
    std::string sock_path = "/tmp/" + app_id + "-" + std::to_string(getuid()) + ".sock";
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock < 0) return -1;

    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, sock_path.c_str(), sizeof(addr.sun_path) - 1);

    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
        // Another instance is running! Notify it to focus
        const char msg[] = "FOCUS\n";
        write(sock, msg, sizeof(msg));
        close(sock);
        return 1; // Existing instance alerted
    }

    // No existing instance; bind this socket
    unlink(sock_path.c_str());
    if (bind(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(sock);
        return 0;
    }
    listen(sock, 5);
    return 0; // We are the primary instance
}

} // namespace

int main(int argc, char** argv) {
    // Check single-instance lock
    if (check_single_instance("typex-app") == 1) {
        std::cout << "[typex-app] Another instance of TypeX is already active. Focused existing window." << std::endl;
        return 0;
    }

    // Set signal handlers to prevent orphaned backend processes
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGHUP, signal_handler);
    atexit(kill_all_child_processes);

    // Dynamic free port selection
    int port = find_free_port();
    std::cout << "[typex-app] Selected dynamic loopback port: " << port << std::endl;

    // Locate typex-server binary
    std::string backend_path = "./backend/typex_server";
    if (access("/usr/lib/typex/typex-server", X_OK) == 0) {
        backend_path = "/usr/lib/typex/typex-server";
    } else if (access("backend/typex_server", X_OK) == 0) {
        backend_path = "backend/typex_server";
    }

    // Spawn managed child backend process
    pid_t pid = fork();
    if (pid < 0) {
        std::cerr << "[typex-app] Fork failed" << std::endl;
        return 1;
    }

    if (pid == 0) {
        // Child: enable PR_SET_PDEATHSIG so kernel sends SIGTERM if parent shell crashes
        prctl(PR_SET_PDEATHSIG, SIGTERM);

        // Forward CLI args or default port
        std::string portStr = std::to_string(port);
        std::vector<const char*> child_args;
        child_args.push_back(backend_path.c_str());
        child_args.push_back("--port");
        child_args.push_back(portStr.c_str());

        // Pass through any user arguments (like --host 0.0.0.0, --data-dir, etc.)
        for (int i = 1; i < argc; ++i) {
            child_args.push_back(argv[i]);
        }
        child_args.push_back(nullptr);

        execv(backend_path.c_str(), const_cast<char**>(child_args.data()));
        _exit(1);
    }

    g_backend_pid = pid;
    std::cout << "[typex-app] Spawned native backend PID " << g_backend_pid << std::endl;

    // Poll health check until backend is responsive (timeout: 5 seconds)
    bool healthy = false;
    for (int i = 0; i < 50; ++i) {
        if (check_health(port)) {
            healthy = true;
            break;
        }
        usleep(100000); // 100ms
    }

    if (!healthy) {
        std::cerr << "[typex-app] Backend failed health check on port " << port << std::endl;
        kill_all_child_processes();
        return 1;
    }

    std::cout << "[typex-app] Backend healthy on port " << port << ". Initializing native WebKit window..." << std::endl;

    std::string app_url = "http://127.0.0.1:" + std::to_string(port);

    std::string js_script = 
        "imports.gi.versions.Gtk = '3.0';\n"
        "imports.gi.versions.WebKit2 = '4.1';\n"
        "const { Gtk, WebKit2, GLib } = imports.gi;\n"
        "Gtk.init(null);\n"
        "let win = new Gtk.Window({ title: 'TypeX', default_width: 1200, default_height: 800 });\n"
        "win.set_wmclass('typex-app', 'TypeX');\n"
        "let iconPath = '/usr/share/icons/hicolor/256x256/apps/typex.png';\n"
        "if (GLib.file_test(iconPath, GLib.FileTest.EXISTS)) win.set_icon_from_file(iconPath);\n"
        "let wv = new WebKit2.WebView();\n"
        "let settings = wv.get_settings();\n"
        "settings.enable_developer_extras = true;\n"
        "settings.enable_javascript = true;\n"
        "wv.load_uri('" + app_url + "');\n"
        "win.add(wv);\n"
        "win.connect('destroy', () => { Gtk.main_quit(); });\n"
        "win.show_all();\n"
        "Gtk.main();\n";

    std::string py_script = 
        "import sys, gi\n"
        "try:\n"
        "    gi.require_version('Gtk', '3.0')\n"
        "    gi.require_version('WebKit2', '4.1')\n"
        "    from gi.repository import Gtk, WebKit2, GLib\n"
        "    Gtk.init()\n"
        "    win = Gtk.Window(title='TypeX')\n"
        "    win.set_default_size(1200, 800)\n"
        "    win.set_wmclass('typex-app', 'TypeX')\n"
        "    wv = WebKit2.WebView()\n"
        "    wv.load_uri('" + app_url + "')\n"
        "    win.add(wv)\n"
        "    win.connect('destroy', lambda w: Gtk.main_quit())\n"
        "    win.show_all()\n"
        "    Gtk.main()\n"
        "except Exception as e:\n"
        "    sys.exit(1)\n";

    pid_t gui_pid = fork();
    if (gui_pid == 0) {
        prctl(PR_SET_PDEATHSIG, SIGTERM);
        if (access("/usr/bin/gjs", X_OK) == 0) {
            execlp("gjs", "gjs", "-c", js_script.c_str(), nullptr);
        } else if (access("/usr/bin/python3", X_OK) == 0) {
            execlp("python3", "python3", "-c", py_script.c_str(), nullptr);
        } else {
            execlp("xdg-open", "xdg-open", app_url.c_str(), nullptr);
        }
        _exit(1);
    }

    g_gui_pid = gui_pid;
    if (gui_pid > 0) {
        int status;
        waitpid(gui_pid, &status, 0);
        g_gui_pid = -1;
    }

    // When the window closes, cleanly shutdown all processes
    kill_all_child_processes();
    return 0;
}
