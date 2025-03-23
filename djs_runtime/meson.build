project('djs_runtime', 'c')

djs_runtime = library(
  'djs_runtime',
  ['runtime.c', 'object.c', 'print.c', 'function.c'],
  dependencies: dependency('bdw-gc')
)

test_object_get = executable(
  'test_object_get',
  ['test_object_get.c'],
  link_with: [djs_runtime]
)
test('object get', test_object_get)

test_call = executable(
  'test_call',
  ['test_call.c'],
  link_with: [djs_runtime]
)
test('call', test_call)
