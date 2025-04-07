project(
  'djs_runtime',
  'c',
  default_options: [
    'warning_level=3',
    'c_std=gnu2x',
    'werror=true',
  ]
)

add_global_arguments(
  '-Wno-nullability-completeness',
  '-Wno-nullability-extension',
  language : 'c'
)

djs_runtime = library(
  'djs_runtime',
  ['runtime.c', 'object.c', 'print.c', 'function.c'],
  dependencies: dependency('bdw-gc')
)

tests = [
  'test_object_get.c',
  'test_call.c',
  'test_get_from_prototype.c',
]

foreach test: tests
  test_name = test.split('.')[0]
  test_executable = executable(
    test_name,
    [test],
    link_with: [djs_runtime],
    override_options: [
      'werror=false',
    ]
  )
  test(test_name, test_executable)

endforeach
