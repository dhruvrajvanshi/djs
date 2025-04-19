import { test, expect } from 'vitest'
import { build_function } from './il.js'
import { to_c } from './to_c.js'

test('generated_c_output_fib', async () => {
  await expect(to_c(fib)).toMatchFileSnapshot(
    'test_snapshots/generated_c_output_fib.c',
  )
})

const fib = build_function('@fib', (b, i) => {
  b.add_param('$0', b.js_value)
  i.strict_eq('%is_zero', b.number(0), b.param('$0'))
  i.strict_eq('%is_one', b.number(1), b.param('$0'))
  i.or('%should_ret_zero', b.local('%is_zero'), b.local('%is_one'))
  i.jump_if(b.local('%should_ret_zero'), '.ret_zero', '.recur')
  b.add_block('.ret_zero', () => {
    i.return(b.number(0))
  })
  b.add_block('.recur', () => {
    i.sub('%n_minus_1', b.param('$0'), b.number(1))
    i.sub('%n_minus_2', b.param('$0'), b.number(2))
    i.call('%fib_minus_1', b.global('@fib'), [b.local('%n_minus_1')])
    i.call('%fib_minus_2', b.global('@fib'), [b.local('%n_minus_2')])
    i.add('%result', b.local('%fib_minus_1'), b.local('%fib_minus_2'))
    i.return(b.local('%result'))
  })
})
