set(USE_PORTRAIT ON)
set(CUSTOM_COPY_RESOURCE_HOOK ON)
set(TARGET_IOS_VERSION "15.0" CACHE STRING "Minimum iOS" FORCE)
set(USE_SE_V8 ON CACHE BOOL "" FORCE)
set(USE_SE_JSC OFF CACHE BOOL "" FORCE)
set(USE_V8_DEBUGGER OFF CACHE BOOL "" FORCE)
# This recovered release resource set has no builtin-debug-renderer,
# builtin-geometry-renderer or builtin-occlusion-query effects.
# PipelineSceneData::initDebugRenderer indexes pass[0] without a size check.
set(USE_DEBUG_RENDERER OFF CACHE BOOL "" FORCE)
set(USE_GEOMETRY_RENDERER OFF CACHE BOOL "" FORCE)
set(USE_OCCLUSION_QUERY OFF CACHE BOOL "" FORCE)
set(USE_PLUGINS OFF CACHE BOOL "" FORCE)
set(USE_PHYSICS_PHYSX OFF CACHE BOOL "" FORCE)
set(USE_SPINE_3_8 ON CACHE BOOL "" FORCE)
set(USE_SPINE_4_2 OFF CACHE BOOL "" FORCE)
set(USE_WEBVIEW OFF CACHE BOOL "" FORCE)
set(USE_VIDEO OFF CACHE BOOL "" FORCE)
set(MACOSX_BUNDLE_GUI_IDENTIFIER "com.ltzj.native.ios")
