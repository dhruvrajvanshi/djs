project(
  'djs',
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
  ['./djs/runtime/djs.c'],
  dependencies: dependency('bdw-gc'),
  include_directories: include_directories('./djs/runtime')
)

tests = [
  'test_console_log.c',
]

foreach test: tests
  test_name = test.split('.')[0]
  test_executable = executable(
    test_name,
    ['./djs/runtime/' + test],
    link_with: djs_runtime,
    dependencies: dependency('bdw-gc'),
    override_options: [
      'werror=false',
    ]
  )
  test(test_name, test_executable)

endforeach

