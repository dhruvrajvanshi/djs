project('djs_runtime', 'c')

djs_runtime = library(
  'djs_runtime',
  ['runtime.c', 'object.c', 'print.c', 'function.c'],
  dependencies: dependency('bdw-gc')
)

tests = [
  'test_object_get.c',
  'test_call.c',
]

foreach test: tests
  test_name = test.split('.')[0]
  test_executable = executable(
    test_name,
    [test],
    link_with: [djs_runtime]
  )
  test(test_name, test_executable)

endforeach
