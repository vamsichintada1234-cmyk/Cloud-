// JNI bridge: starts Node.js (nodejs-mobile) with the given argv and forwards its stdout/stderr to logcat.
#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include "node.h"

static int pipeOut[2], pipeErr[2];
static const char *TAG = "RefCutNode";

static void *pump(void *arg) {
    int fd = *(int *)arg;
    int prio = fd == pipeErr[0] ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO;
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(prio, TAG, buf);
    }
    return nullptr;
}

static void redirectOutput() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipeOut) == -1 || pipe(pipeErr) == -1) return;
    dup2(pipeOut[1], STDOUT_FILENO);
    dup2(pipeErr[1], STDERR_FILENO);
    pthread_t a, b;
    if (pthread_create(&a, nullptr, pump, &pipeOut[0]) == 0) pthread_detach(a);
    if (pthread_create(&b, nullptr, pump, &pipeErr[0]) == 0) pthread_detach(b);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_refcut_app_NodeRunner_startNode(JNIEnv *env, jclass, jobjectArray arguments) {
    jsize argc = env->GetArrayLength(arguments);
    // node expects all argv strings in one contiguous buffer
    std::vector<std::string> parts;
    size_t total = 0;
    for (jsize i = 0; i < argc; i++) {
        auto js = (jstring)env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(js, nullptr);
        parts.emplace_back(c);
        total += parts.back().size() + 1;
        env->ReleaseStringUTFChars(js, c);
        env->DeleteLocalRef(js);
    }
    char *buffer = (char *)calloc(total, 1);
    std::vector<char *> argv(argc);
    char *cur = buffer;
    for (jsize i = 0; i < argc; i++) {
        memcpy(cur, parts[i].c_str(), parts[i].size());
        argv[i] = cur;
        cur += parts[i].size() + 1;
    }
    redirectOutput();
    return (jint)node::Start(argc, argv.data());
}
